/**
 * 文件预览的载荷与类型判定。
 *
 * 个人空间与对话目录的文件读取端点返回同一份载荷（文本与 markdown 走 JSON，图片与 PDF 走二进制
 * 流），预览类型判定按扩展名与响应 content-type 双轨，两个切片共用这一处。缓存与对象 URL 的
 * 生命周期不在这里，由各自的调用方持有。
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

export const isMarkdownPreview = (
  path: unknown,
  previewType: unknown,
): boolean =>
  previewType === 'markdown' ||
  MARKDOWN_EXTENSIONS.has(getPreviewFileExtension(path));

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
