/**
 * 文件预览的纯逻辑。
 *
 * 对齐参照的 `utils/file_preview.js` 与 `AgentPanel.vue` 里的预览缓存：类型判定按扩展名与响应
 * content-type 双轨；缓存条目按「作用域 + 路径」为键、带最近访问时间，超过上限按最旧淘汰，淘汰
 * 与替换都必须 `revokeObjectURL`——对象 URL 不回收就是内存泄漏。
 */

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);
const IMAGE_EXTENSIONS = new Set([
  '.apng',
  '.avif',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.svg',
]);
const PDF_EXTENSIONS = new Set(['.pdf']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const OFFICE_EXTENSIONS = new Set(['.docx', '.pptx']);
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.text',
  '.log',
  '.json',
  '.jsonl',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.csv',
  '.tsv',
  '.py',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.vue',
  '.html',
  '.htm',
  '.css',
  '.less',
  '.scss',
  '.xml',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.go',
  '.java',
  '.kt',
  '.rs',
  '.php',
  '.rb',
  '.c',
  '.h',
  '.cpp',
  '.cc',
  '.cxx',
  '.hpp',
  '.cs',
  '.swift',
  '.dockerfile',
]);

/** 预览缓存最多保留多少条就绪条目。 */
export const PREVIEW_CACHE_LIMIT = 12;

export type PreviewType =
  | 'text'
  | 'markdown'
  | 'image'
  | 'pdf'
  | 'html'
  | 'office'
  | 'json'
  | 'unsupported';

/** 预览条目在生命周期里的四种状态。 */
export type PreviewStatus = 'loading' | 'ready' | 'error' | 'unsupported';

export type PreviewFile = {
  path: string;
  name: string;
  status: PreviewStatus;
  previewType: PreviewType;
  supported: boolean;
  content: string | null;
  /** 二进制预览（图片 / PDF）的对象 URL；用完必须回收。 */
  previewUrl: string;
  message: string;
  /** 服务端截短了内容时为真；界面上要提示去下载完整文件。 */
  truncated: boolean;
};

export type PreviewCacheEntry = {
  status: 'loading' | 'ready';
  file: PreviewFile;
  lastAccessed: number;
};

export type PreviewCache = Map<string, PreviewCacheEntry>;

/** 取路径的小写扩展名；隐藏文件（`.gitignore`）不算扩展名。 */
export function getPreviewFileExtension(path: unknown): string {
  const normalized = String(path ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return '';

  const fileName = normalized.split('/').pop() ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return '';

  return fileName.slice(dotIndex);
}

export const isMarkdownPreview = (path: unknown, previewType: unknown): boolean =>
  previewType === 'markdown' || MARKDOWN_EXTENSIONS.has(getPreviewFileExtension(path));

/** 按扩展名判定预览类型。 */
export function getPreviewTypeByPath(path: unknown): PreviewType {
  const extension = getPreviewFileExtension(path);
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
  if (HTML_EXTENSIONS.has(extension)) return 'html';
  if (OFFICE_EXTENSIONS.has(extension)) return 'office';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';

  return 'unsupported';
}

/** 按响应的 content-type 判定；兜底走扩展名判定不到的分支。 */
export function getPreviewTypeByContentType(contentType: unknown): PreviewType {
  const normalized = String(contentType ?? '').toLowerCase();
  if (normalized.includes('application/pdf')) return 'pdf';
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.includes('text/markdown')) return 'markdown';
  if (normalized.includes('text/html')) return 'html';
  if (normalized.startsWith('text/')) return 'text';
  if (normalized.includes('application/json')) return 'json';

  return 'unsupported';
}

/** 缓存键；作用域前缀让对话目录与个人空间的同名路径互不串。 */
export const previewCacheKey = (input: {
  scope: 'thread' | 'workspace';
  threadId?: string;
  path: string;
}): string => (input.scope === 'workspace' ? `workspace:${input.path}` : `${input.threadId ?? ''}:${input.path}`);

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
    .sort(([, left], [, right]) => (left.lastAccessed || 0) - (right.lastAccessed || 0));

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

/**
 * 从 Content-Disposition 里解出下载文件名。
 *
 * 优先 RFC 5987 的 `filename*=UTF-8''…`（中文文件名），ASCII 的 `filename="…"` 兜底；都解析不出
 * 时返回空串，由调用方退回条目自身的名字。
 */
export function parseDownloadFilename(contentDisposition: unknown): string {
  const header = String(contentDisposition ?? '');
  if (!header) return '';

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // 编码坏了就退到 ASCII 分支
    }
  }

  const asciiMatch = header.match(/filename="?([^";]+)"?/i);

  return asciiMatch?.[1] ?? '';
}

/**
 * 用浏览器下载一个 blob，并立即回收临时对象 URL。
 *
 * 返回是否真的触发了下载；环境不支持时为 false，调用方按失败提示。
 */
export function saveBlobAsFile(input: {
  blob: Blob;
  filename: string;
}): boolean {
  if (typeof document === 'undefined' || !window.URL?.createObjectURL) return false;

  const url = window.URL.createObjectURL(input.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = input.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);

  return true;
}
