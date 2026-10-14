import { describe, expect, it, vi } from 'vitest';

import {
  invalidatePreviewCacheEntry,
  previewCacheKey,
  prunePreviewCache,
  replacePreviewCacheEntryIfCurrent,
  settlePreviewCacheLoad,
  PREVIEW_CACHE_LIMIT,
  type PreviewCache,
} from '@/features/chat/lib/panel-preview';
import type { PreviewFile } from '@/shared/lib/file-preview';

const readyFile = (path: string, previewUrl = ''): PreviewFile => ({
  path,
  name: path.split('/').pop() ?? path,
  status: 'ready',
  previewType: 'text',
  supported: true,
  content: 'x',
  previewUrl,
  message: '',
  truncated: false,
});

describe('previewCacheKey', () => {
  it('个人空间与会话各自成键，同名路径不串', () => {
    expect(previewCacheKey({ scope: 'workspace', path: '/a.md' })).toBe(
      'workspace:/a.md',
    );
    expect(
      previewCacheKey({ scope: 'thread', threadId: 't-1', path: '/a.md' }),
    ).toBe('t-1:/a.md');
  });
});

const makeCache = (): PreviewCache => new Map();

describe('replacePreviewCacheEntryIfCurrent', () => {
  it('只覆盖发起请求时的那一条；迟到的响应被拒收', () => {
    const cache = makeCache();
    const loadingEntry = {
      status: 'loading' as const,
      file: readyFile('/a.md'),
      lastAccessed: 1,
    };
    cache.set('k', loadingEntry);

    expect(
      replacePreviewCacheEntryIfCurrent(cache, 'k', loadingEntry, {
        status: 'ready',
        file: readyFile('/a.md'),
        lastAccessed: 2,
      }),
    ).toBe(true);

    // 现在缓存里是新的 ready 条目，旧的 loadingEntry 再来就该被拒
    expect(
      replacePreviewCacheEntryIfCurrent(cache, 'k', loadingEntry, null),
    ).toBe(false);
  });
});

describe('settlePreviewCacheLoad', () => {
  it('发布失败时回收响应带来的对象 URL', () => {
    const cache = makeCache();
    const revoke = vi.fn();
    const published = settlePreviewCacheLoad({
      cache,
      cacheKey: 'k',
      loadingEntry: {
        status: 'loading',
        file: readyFile('/a.md'),
        lastAccessed: 1,
      },
      nextFile: readyFile('/a.md', 'blob:x'),
      lastAccessed: 2,
      revokeObjectURL: revoke,
    });

    expect(published).toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });

  it('发布成功时不回收', () => {
    const cache = makeCache();
    const loadingEntry = {
      status: 'loading' as const,
      file: readyFile('/a.md'),
      lastAccessed: 1,
    };
    cache.set('k', loadingEntry);
    const revoke = vi.fn();

    const published = settlePreviewCacheLoad({
      cache,
      cacheKey: 'k',
      loadingEntry,
      nextFile: readyFile('/a.md', 'blob:x'),
      lastAccessed: 2,
      revokeObjectURL: revoke,
    });

    expect(published).toBe(true);
    expect(revoke).not.toHaveBeenCalled();
  });
});

describe('prunePreviewCache', () => {
  const fill = (
    revoke: (url: string) => void = vi.fn(),
  ): { cache: PreviewCache; revoke: (url: string) => void } => {
    const cache = makeCache();
    for (let index = 0; index < PREVIEW_CACHE_LIMIT + 3; index += 1) {
      cache.set(`k${index}`, {
        status: 'ready',
        file: readyFile(`/f${index}.md`, `blob:${index}`),
        lastAccessed: index,
      });
    }

    return { cache, revoke };
  };

  it('超过上限按最近使用淘汰最旧的，并回收它们的 URL', () => {
    const revoke = vi.fn();
    const { cache } = fill(revoke);

    prunePreviewCache({ cache, activeKey: null, revokeObjectURL: revoke });

    expect(cache.size).toBe(PREVIEW_CACHE_LIMIT);
    // 最旧的 k0..k2 被淘汰
    expect(cache.has('k0')).toBe(false);
    expect(cache.has('k3')).toBe(true);
    expect(revoke.mock.calls.map(([url]) => url)).toEqual([
      'blob:0',
      'blob:1',
      'blob:2',
    ]);
  });

  it('当前正在看的条目不淘汰；这一轮因此少淘汰一个（与参照一致）', () => {
    const revoke = vi.fn();
    const { cache } = fill(revoke);

    prunePreviewCache({ cache, activeKey: 'k0', revokeObjectURL: revoke });

    // k0 是最旧的但正在看：shift 出来后跳过，循环继续淘汰下一条
    expect(cache.has('k0')).toBe(true);
    expect(cache.has('k1')).toBe(false);
    expect(cache.has('k2')).toBe(false);
    expect(cache.size).toBe(PREVIEW_CACHE_LIMIT + 1);
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:1', 'blob:2']);
  });
});

describe('invalidatePreviewCacheEntry', () => {
  it('删掉条目并回收 URL；没有条目时返回 false', () => {
    const cache = makeCache();
    cache.set('k', {
      status: 'ready',
      file: readyFile('/a.md', 'blob:x'),
      lastAccessed: 1,
    });
    const revoke = vi.fn();

    expect(
      invalidatePreviewCacheEntry({
        cache,
        cacheKey: 'k',
        revokeObjectURL: revoke,
      }),
    ).toBe(true);
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(cache.has('k')).toBe(false);
    expect(
      invalidatePreviewCacheEntry({
        cache,
        cacheKey: 'k',
        revokeObjectURL: revoke,
      }),
    ).toBe(false);
  });
});
