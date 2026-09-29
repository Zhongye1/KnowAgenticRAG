/**
 * 上传限制常量。
 *
 * 后端才是硬关口：格式子集 415（`ingest/api/v1/router.py`）、大小/PDF 页数
 * 422（`ingest/limits.py`）。超限时信封 `msg` 是可读文案（原因 + 纠正建议），
 * 结构化的 `{ code, reason, suggestion }` 落在 `data`
 * （见 docs/工程治理/中间件与异常处理.md §6.3）。
 * 这里只做同口径的**前端软校验**，让用户在选择文件时就能拿到反馈，
 * 不必等一次注定失败的往返。数值需与后端 Settings 保持一致。
 */

import { getFileExtension } from './file-utils'

export const MAX_UPLOAD_CONCURRENCY = 4

export const MAX_UPLOAD_FILE_SIZE_MB = 200
export const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024

/** 与后端 `RAGF_INGEST_MAX_PDF_PAGES` 对齐（MinerU 精提取 API 限制，超限 422）。 */
export const MAX_UPLOAD_PDF_PAGES = 200

export const DEFAULT_ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'md',
  'markdown',
  'html',
  'htm',
  'csv',
  'json',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'zip',
] as const

export const ALLOWED_EXTENSIONS_SET = new Set<string>(DEFAULT_ALLOWED_EXTENSIONS)

/** 前端上传软校验：返回错误文案；通过时返回 null。 */
export const getUploadValidationError = (
  file: Pick<File, 'name' | 'size'>,
): string | null => {
  const extension = getFileExtension(file.name)
  if (!extension || !ALLOWED_EXTENSIONS_SET.has(extension)) {
    return `不支持的文件类型${extension ? `（.${extension}）` : ''}`
  }
  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return `文件超过 ${MAX_UPLOAD_FILE_SIZE_MB}MB 上限`
  }
  return null
}
