/**
 * 预览类型与代码语言的映射。
 *
 * 移植上游 `utils/file_preview.js`：扩展名 → 预览类型、扩展名 → 代码语言、Content-Type → 类型。
 * 预览类型的**权威来源是后端**（`ars/utils/filepreview.py` 的 `detect_preview_type` 会看扩展名、
 * MIME、二进制签名与能否按 UTF-8 解码），这里的按路径判断只在响应没给类型时兜底。
 */

/** 二进制预览的类型由响应头带回来（后端 `_binary_preview_response`）。 */
export const PREVIEW_TYPE_HEADER = 'X-Ars-Preview-Type';
export const PREVIEW_FILENAME_HEADER = 'X-Ars-Preview-Filename';

/** 后端会返回的预览类型；`unsupported` 表示只能下载后看。 */
export type PreviewType =
  | 'image'
  | 'pdf'
  | 'markdown'
  | 'html'
  | 'office'
  | 'text'
  | 'json'
  | 'unsupported';

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
  '.sql',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.env',
  '.dockerfile',
  '.gitignore',
]);

/** 语言别名 → shiki 认的语言名（上游 `CODE_LANGUAGE_ALIASES`）。 */
const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  docker: 'dockerfile',
};

/** 扩展名 → 语言（上游 `CODE_LANGUAGE_MAP`）。 */
const CODE_LANGUAGE_MAP: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
  '.vue': 'xml',
  '.html': 'xml',
  '.htm': 'xml',
  '.xml': 'xml',
  '.css': 'css',
  '.less': 'less',
  '.scss': 'scss',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'bash',
  '.sql': 'sql',
  '.java': 'java',
  '.kt': 'kotlin',
  '.go': 'go',
  '.rs': 'rust',
  '.php': 'php',
  '.rb': 'ruby',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.dockerfile': 'dockerfile',
};

/** 取小写扩展名；没有扩展名的（如 `Dockerfile`）返回空串。 */
export const getPreviewFileExtension = (path?: string | null): string => {
  const normalized = String(path ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return '';
  const fileName = normalized.split('/').pop() ?? '';
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return fileName.slice(dotIndex);
};

/** 语言别名归一（上游 `normalizeCodeLanguage`）。 */
export const normalizeCodeLanguage = (language?: string | null): string => {
  const normalized = String(language ?? '')
    .trim()
    .split(/[\s:,]/)[0]
    .toLowerCase();
  return CODE_LANGUAGE_ALIASES[normalized] || normalized;
};

/** 按扩展名猜预览类型；调用方只在响应没给类型时用它。 */
export const getPreviewTypeByPath = (path?: string | null): PreviewType => {
  const extension = getPreviewFileExtension(path);
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
  if (HTML_EXTENSIONS.has(extension)) return 'html';
  if (OFFICE_EXTENSIONS.has(extension)) return 'office';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  return 'unsupported';
};

/** 按扩展名给高亮语言；不认识就返回空串（按纯文本渲染）。 */
export const getCodeLanguageByPath = (path?: string | null): string =>
  normalizeCodeLanguage(CODE_LANGUAGE_MAP[getPreviewFileExtension(path)] ?? '');

/** 按 Content-Type 猜预览类型（上游 `getPreviewTypeByContentType`）。 */
export const getPreviewTypeByContentType = (
  contentType?: string | null,
): PreviewType => {
  const normalized = String(contentType ?? '').toLowerCase();
  if (normalized.includes('application/pdf')) return 'pdf';
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.includes('text/markdown')) return 'markdown';
  if (normalized.includes('text/html')) return 'html';
  if (normalized.startsWith('text/')) return 'text';
  if (normalized.includes('application/json')) return 'json';
  return 'unsupported';
};

/** 文本类按文本渲染（其余走 blob 与 objectURL）。 */
export const isTextPreviewType = (type: PreviewType): boolean =>
  type === 'text' || type === 'markdown' || type === 'html' || type === 'json';

/** 归一后的预览结果：文本类给 `content`，二进制类给 `blob`。 */
export type FilePreview = {
  previewType: PreviewType;
  supported: boolean;
  /** 文本类预览的内容；二进制类是 `null`。 */
  content: string | null;
  /** 二进制类的字节；文本类是 `null`。 */
  blob: Blob | null;
  filename: string;
  message: string;
  /** 文本被截断（后端按 250k 字符截）。 */
  truncated: boolean;
};

/** 后端没给类型时的兜底：先按路径猜，猜不出就当普通文本。 */
const previewTypeOrFallback = (
  value: unknown,
  path?: string | null,
): PreviewType => {
  const fromServer = String(value ?? '') as PreviewType;
  if (fromServer) return fromServer;
  const guessed = getPreviewTypeByPath(path);
  return guessed === 'unsupported' ? 'text' : guessed;
};

/**
 * 把预览响应归一成界面直接能用的形状。
 *
 * 后端有两条返回路径：文本/不支持类回 JSON（带 `content` 与 `supported`），
 * 二进制类回 inline 流并在响应头里给类型与文件名。office 会被服务端先转成 PDF，
 * 因此二进制分支里拿到的是 PDF 字节。
 */
export const readFilePreview = async (
  response: Response,
  fallback: { filename: string },
): Promise<FilePreview> => {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as {
      content?: unknown;
      preview_type?: unknown;
      supported?: unknown;
      message?: unknown;
      truncated?: unknown;
      filename?: unknown;
    };
    return {
      previewType: previewTypeOrFallback(
        payload.preview_type,
        fallback.filename,
      ),
      supported: payload.supported !== false,
      content: typeof payload.content === 'string' ? payload.content : null,
      blob: null,
      filename:
        typeof payload.filename === 'string' && payload.filename
          ? payload.filename
          : fallback.filename,
      message: typeof payload.message === 'string' ? payload.message : '',
      truncated: Boolean(payload.truncated),
    };
  }

  const pathType = getPreviewTypeByPath(fallback.filename);
  const contentTypeType = getPreviewTypeByContentType(contentType);
  const textType = pathType !== 'unsupported' ? pathType : contentTypeType;
  const headerFilename = response.headers.get(PREVIEW_FILENAME_HEADER);
  const filename = headerFilename
    ? decodeURIComponent(headerFilename)
    : fallback.filename;

  if (isTextPreviewType(textType)) {
    return {
      previewType: textType,
      supported: true,
      content: await response.text(),
      blob: null,
      filename,
      message: '',
      truncated: false,
    };
  }

  const previewType =
    (response.headers.get(PREVIEW_TYPE_HEADER) as PreviewType | null) ??
    contentTypeType;
  return {
    previewType,
    supported: previewType !== 'unsupported',
    content: null,
    blob: await response.blob(),
    filename,
    message:
      previewType === 'unsupported' ? '当前文件暂不支持预览，请下载后查看' : '',
    truncated: false,
  };
};
