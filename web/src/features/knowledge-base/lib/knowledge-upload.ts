/**
 * 上传的纯逻辑：类型与大小校验、文件夹相对路径、队列并发、落库参数组装。
 *
 * 百分比来自 `XMLHttpRequest.upload.onprogress`，而这里走生成的 fetch 客户端拿不到字节进度，
 * 因此队列只报告「排队 / 上传中 / 完成 / 失败」四态与计数，不做假百分比。
 */

/** 后端单文件上限（`MAX_UPLOAD_SIZE_BYTES`），文案与后端一致。 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const UPLOAD_TOO_LARGE_MESSAGE =
  '文件过大，当前仅支持 100 MB 以内的文件';

/** 队列并发。 */
export const UPLOAD_CONCURRENCY = 10;

/**
 * 取不到 `/files/supported-types` 时的兜底白名单，与后端
 * `parser/unified.py` 的 `SUPPORTED_FILE_EXTENSIONS` 同步。
 */
export const DEFAULT_SUPPORTED_TYPES = [
  '.bmp',
  '.csv',
  '.docx',
  '.htm',
  '.html',
  '.jpeg',
  '.jpg',
  '.json',
  '.md',
  '.pdf',
  '.png',
  '.pptx',
  '.tif',
  '.tiff',
  '.txt',
  '.xls',
  '.xlsx',
  '.zip',
] as const;

/**
 * 需要 OCR 才能抽文本的图片类型：后端的 `OCR_FILE_EXTENSIONS` 去掉 `.pdf`
 * （PDF 不强制 OCR）。这里以本集合为准。
 */
export const OCR_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.bmp',
  '.webp',
  '.tiff',
  '.tif',
]);

export type UploadRejection = { name: string; reason: string };

/** 小写扩展名；没有扩展名返回空串。 */
export const getFileExtension = (name: string): string => {
  const normalized = String(name ?? '')
    .trim()
    .toLowerCase();
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return normalized.slice(dotIndex);
};

/** 图片要开 OCR 才能抽文本（后端同款集合）。 */
export const needsOcr = (name: string): boolean =>
  OCR_IMAGE_EXTENSIONS.has(getFileExtension(name));

/**
 * 上传时用的文件名：文件夹上传带上相对路径，后端据此投影出目录。
 */
export const getUploadFilename = (file: File): string => {
  const relative = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  return relative && relative.trim() ? relative : file.name;
};

/**
 * 按白名单与大小过滤一批待上传文件。
 *
 * 图片是否要 OCR 只影响「能不能提交」的判断，不在这里拒绝：调用方要先把
 * 「检测到图片但没有开 OCR」整批拦下并提示。
 */
export const validateUploadBatch = (
  files: ArrayLike<File>,
  supported: readonly string[],
): { accepted: File[]; rejected: UploadRejection[] } => {
  const allowed = new Set(supported.map((item) => item.toLowerCase()));
  const accepted: File[] = [];
  const rejected: UploadRejection[] = [];

  for (const file of Array.from(files)) {
    const name = getUploadFilename(file);
    const extension = getFileExtension(name);
    if (!extension || !allowed.has(extension)) {
      // 没有扩展名的（Dockerfile、LICENSE）后端也会拒，这里当场说清楚
      rejected.push({
        name,
        reason: extension
          ? `不支持的文件类型：${extension}`
          : '缺少文件扩展名，无法判断类型',
      });
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      rejected.push({ name, reason: UPLOAD_TOO_LARGE_MESSAGE });
      continue;
    }
    accepted.push(file);
  }

  return { accepted, rejected };
};

/** 一批文件里有没有需要 OCR 的图片。 */
export const hasOcrImages = (files: ArrayLike<File>): boolean =>
  Array.from(files).some((file) => needsOcr(getUploadFilename(file)));

export type UploadedFile = {
  /** 待上传文件在批次里的下标，用来把结果对回界面上的行。 */
  index: number;
  name: string;
  file_path: string;
  content_hash?: string | null;
  size?: number | null;
};

/**
 * 组装三阶段 ingest（`POST /databases/{kb_id}/documents`）的参数：
 * 后端按 `content_hashes` 校验上传结果
 * （键是 MinIO 路径），`file_sizes` 让它不用再回源对象存储取大小。
 */
export const buildAddDocumentsParams = (
  uploaded: UploadedFile[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> => {
  const content_hashes: Record<string, string> = {};
  const file_sizes: Record<string, number> = {};
  for (const item of uploaded) {
    if (item.content_hash) content_hashes[item.file_path] = item.content_hash;
    if (typeof item.size === 'number' && Number.isFinite(item.size)) {
      file_sizes[item.file_path] = item.size;
    }
  }
  return {
    content_type: 'file',
    ...extra,
    content_hashes,
    file_sizes,
  };
};

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error';

export type UploadResult = {
  index: number;
  file: File;
  status: 'done' | 'error';
  response?: {
    file_path?: string;
    content_hash?: string | null;
    size?: number | null;
  };
  error?: string;
};

/**
 * 按并发上限跑一遍上传队列，返回与入参同序的结果。
 *
 * 单个失败不影响其余，`onStatus` 用来把状态变化推给界面，
 * 失败原因通过返回值的 `error` 交给调用方展示。
 */
export const runUploadPool = async (
  files: File[],
  upload: (
    file: File,
    filename: string,
  ) => Promise<{
    file_path?: string;
    content_hash?: string | null;
    size?: number | null;
  }>,
  options: {
    concurrency?: number;
    onStatus?: (index: number, status: UploadStatus) => void;
  } = {},
): Promise<UploadResult[]> => {
  const concurrency = Math.max(1, options.concurrency ?? UPLOAD_CONCURRENCY);
  // 先占位再按 index 填，保证结果与入参同序
  const results: UploadResult[] = Array.from({ length: files.length });
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < files.length) {
      const index = next;
      next += 1;
      const file = files[index];
      options.onStatus?.(index, 'uploading');
      try {
        const response = await upload(file, getUploadFilename(file));
        results[index] = { index, file, status: 'done', response };
        options.onStatus?.(index, 'done');
      } catch (error) {
        results[index] = {
          index,
          file,
          status: 'error',
          error: error instanceof Error ? error.message : '上传失败',
        };
        options.onStatus?.(index, 'error');
      }
    }
  };

  files.forEach((_file, index) => options.onStatus?.(index, 'queued'));
  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, worker),
  );
  return results;
};
