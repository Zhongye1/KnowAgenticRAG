/**
 * 面板预览缓存的纯逻辑。
 *
 * 对齐参照的 `AgentPanel.vue` 里的预览缓存：缓存条目按「作用域 + 路径」为键、带最近访问时间，
 * 超过上限按最旧淘汰，淘汰与替换都必须 `revokeObjectURL`——对象 URL 不回收就是内存泄漏。
 * 载荷形状与类型判定在 `@/shared/lib/file-preview`，个人空间页面共用同一份。
 */
import type { PreviewFile } from '@/shared/lib/file-preview';

/** 预览缓存最多保留多少条就绪条目。 */
export const PREVIEW_CACHE_LIMIT = 12;

export type PreviewCacheEntry = {
  status: 'loading' | 'ready';
  file: PreviewFile;
  lastAccessed: number;
};

export type PreviewCache = Map<string, PreviewCacheEntry>;

/** 缓存键；作用域前缀让对话目录与个人空间的同名路径互不串。 */
export const previewCacheKey = (input: {
  scope: 'thread' | 'workspace';
  threadId?: string;
  path: string;
}): string =>
  input.scope === 'workspace'
    ? `workspace:${input.path}`
    : `${input.threadId ?? ''}:${input.path}`;

const entriesMatch = (
  left: PreviewCacheEntry | undefined,
  right: PreviewCacheEntry | undefined,
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.file && right.file) return left.file === right.file;

  return false;
};

/**
 * 只有缓存里的条目仍然是「发起请求时的那一条」时才允许覆盖。
 *
 * 迟到的响应不能盖掉用户已经切到的新文件；这里返回 false 时调用方要负责回收它带回来的 URL。
 */
export function replacePreviewCacheEntryIfCurrent(
  cache: PreviewCache,
  cacheKey: string,
  currentEntry: PreviewCacheEntry,
  nextEntry: PreviewCacheEntry | null,
): boolean {
  const existing = cache.get(cacheKey);
  if (!entriesMatch(existing, currentEntry)) return false;

  if (nextEntry) cache.set(cacheKey, nextEntry);
  else cache.delete(cacheKey);

  return true;
}

/** 上传（加载）完成后发布结果；发布失败说明请求已过期，必须回收它带来的 URL。 */
export function settlePreviewCacheLoad(input: {
  cache: PreviewCache;
  cacheKey: string;
  loadingEntry: PreviewCacheEntry;
  nextFile: PreviewFile;
  lastAccessed: number;
  revokeObjectURL: (url: string) => void;
}): boolean {
  const published = replacePreviewCacheEntryIfCurrent(
    input.cache,
    input.cacheKey,
    input.loadingEntry,
    {
      status: 'ready',
      file: input.nextFile,
      lastAccessed: input.lastAccessed,
    },
  );
  if (!published && input.nextFile.previewUrl) {
    input.revokeObjectURL(input.nextFile.previewUrl);
  }

  return published;
}

/** 缓存超过上限时按最近使用淘汰；当前正在看的条目不淘汰。 */
export function prunePreviewCache(input: {
  cache: PreviewCache;
  activeKey: string | null;
  revokeObjectURL: (url: string) => void;
}): void {
  const readyEntries = [...input.cache.entries()]
    .filter(([, entry]) => entry.status === 'ready')
    .sort(
      ([, left], [, right]) =>
        (left.lastAccessed || 0) - (right.lastAccessed || 0),
    );

  while (readyEntries.length > PREVIEW_CACHE_LIMIT) {
    const [key, entry] = readyEntries.shift() ?? [];
    if (key === undefined) break;
    if (key === input.activeKey) continue;
    if (entry?.file.previewUrl) input.revokeObjectURL(entry.file.previewUrl);
    input.cache.delete(key);
  }
}

/** 重载前作废旧条目：删掉缓存并回收它的 URL。 */
export function invalidatePreviewCacheEntry(input: {
  cache: PreviewCache;
  cacheKey: string;
  revokeObjectURL: (url: string) => void;
}): boolean {
  const cached = input.cache.get(input.cacheKey);
  if (!cached) return false;

  input.cache.delete(input.cacheKey);
  if (cached.status === 'ready' && cached.file.previewUrl) {
    input.revokeObjectURL(cached.file.previewUrl);
  }

  return true;
}

/** 预览加载失败时给用户的文案。 */
export const describePreviewError = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : '文件读取失败';
