import { describe, expect, it, vi } from 'vitest';

import {
  getPreviewFileExtension,
  parseDownloadFilename,
  saveBlobAsFile,
  getPreviewTypeByContentType,
  getPreviewTypeByPath,
  invalidatePreviewCacheEntry,
  isMarkdownPreview,
  previewCacheKey,
  prunePreviewCache,
  replacePreviewCacheEntryIfCurrent,
  settlePreviewCacheLoad,
  PREVIEW_CACHE_LIMIT,
  type PreviewCache,
  type PreviewFile,
} from '@/features/chat/lib/panel-preview';

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

describe('getPreviewFileExtension', () => {
  it('取小写扩展名；隐藏文件不算', () => {
    expect(getPreviewFileExtension('/a/B.PDF')).toBe('.pdf');
    expect(getPreviewFileExtension('/a/.gitignore')).toBe('');
    expect(getPreviewFileExtension('/a/noext')).toBe('');
    expect(getPreviewFileExtension('')).toBe('');
  });
});

describe('getPreviewTypeByPath', () => {
  it('按扩展名分组', () => {
    expect(getPreviewTypeByPath('/a/b.md')).toBe('markdown');
    expect(getPreviewTypeByPath('/a/b.png')).toBe('image');
    expect(getPreviewTypeByPath('/a/b.pdf')).toBe('pdf');
    expect(getPreviewTypeByPath('/a/b.docx')).toBe('office');
    expect(getPreviewTypeByPath('/a/b.py')).toBe('text');
    expect(getPreviewTypeByPath('/a/b.weird')).toBe('unsupported');
  });
});

describe('getPreviewTypeByContentType', () => {
  it('按响应头分组', () => {
    expect(getPreviewTypeByContentType('application/pdf')).toBe('pdf');
    expect(getPreviewTypeByContentType('image/png')).toBe('image');
    expect(getPreviewTypeByContentType('text/markdown')).toBe('markdown');
    expect(getPreviewTypeByContentType('application/json')).toBe('json');
    expect(getPreviewTypeByContentType('application/octet-stream')).toBe('unsupported');
  });
});

describe('isMarkdownPreview', () => {
  it('类型声明或扩展名任一命中', () => {
    expect(isMarkdownPreview('/a/b.md', 'text')).toBe(true);
    expect(isMarkdownPreview('/a/b.txt', 'markdown')).toBe(true);
    expect(isMarkdownPreview('/a/b.txt', 'text')).toBe(false);
  });
});

describe('previewCacheKey', () => {
  it('个人空间与会话各自成键，同名路径不串', () => {
    expect(previewCacheKey({ scope: 'workspace', path: '/a.md' })).toBe('workspace:/a.md');
    expect(previewCacheKey({ scope: 'thread', threadId: 't-1', path: '/a.md' })).toBe(
      't-1:/a.md',
    );
  });
});

const makeCache = (): PreviewCache => new Map();

describe('replacePreviewCacheEntryIfCurrent', () => {
  it('只覆盖发起请求时的那一条；迟到的响应被拒收', () => {
    const cache = makeCache();
    const loadingEntry = { status: 'loading' as const, file: readyFile('/a.md'), lastAccessed: 1 };
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
      loadingEntry: { status: 'loading', file: readyFile('/a.md'), lastAccessed: 1 },
      nextFile: readyFile('/a.md', 'blob:x'),
      lastAccessed: 2,
      revokeObjectURL: revoke,
    });

    expect(published).toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });

  it('发布成功时不回收', () => {
    const cache = makeCache();
    const loadingEntry = { status: 'loading' as const, file: readyFile('/a.md'), lastAccessed: 1 };
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
  const fill = (revoke: (url: string) => void = vi.fn()): { cache: PreviewCache; revoke: (url: string) => void } => {
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
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:0', 'blob:1', 'blob:2']);
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

    expect(invalidatePreviewCacheEntry({ cache, cacheKey: 'k', revokeObjectURL: revoke })).toBe(
      true,
    );
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(cache.has('k')).toBe(false);
    expect(invalidatePreviewCacheEntry({ cache, cacheKey: 'k', revokeObjectURL: revoke })).toBe(
      false,
    );
  });
});

describe('parseDownloadFilename', () => {
  it('优先 RFC 5987 的 UTF-8 文件名', () => {
    expect(
      parseDownloadFilename("inline; filename*=UTF-8''%E6%8A%A5%E5%91%8A.md; filename=report.md"),
    ).toBe('报告.md');
  });

  it('ASCII 的 filename 兜底', () => {
    expect(parseDownloadFilename('attachment; filename="report.md"')).toBe('report.md');
    expect(parseDownloadFilename('attachment; filename=report.md')).toBe('report.md');
  });

  it('解析不出或编码损坏时返回空串', () => {
    expect(parseDownloadFilename('')).toBe('');
    expect(parseDownloadFilename(null)).toBe('');
    expect(parseDownloadFilename("inline; filename*=UTF-8'%ZZ.md")).toBe('');
  });
});

describe('saveBlobAsFile', () => {
  it('建临时对象 URL 触发下载并立即回收', () => {
    const createObjectURL = vi.fn(() => 'blob:tmp');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window, 'URL', {
      value: { ...window.URL, createObjectURL, revokeObjectURL },
      configurable: true,
    });
    const click = vi.fn();
    const append = vi.fn();
    const remove = vi.fn();
    const link: Record<string, unknown> = {};
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      remove,
      set href(v: unknown) {
        link.href = v;
      },
      get href() {
        return link.href;
      },
      set download(v: unknown) {
        link.download = v;
      },
      get download() {
        return link.download;
      },
    } as unknown as HTMLElement);
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(append);

    const ok = saveBlobAsFile({ blob: new Blob(['x']), filename: '报告.md' });

    expect(ok).toBe(true);
    expect(link.href).toBe('blob:tmp');
    expect(link.download).toBe('报告.md');
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:tmp');
    expect(appendChild).toHaveBeenCalledTimes(1);

    createElement.mockRestore();
    appendChild.mockRestore();
  });
});
