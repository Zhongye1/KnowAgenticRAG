/**
 * 上传限制常量。
 *
 * 服务端暂未做扩展名/大小强校验（M6 缺口），此处为前端软限制，
 * 与后端打通后应读取服务端支持清单（原系统的 supported-types 等价物）。
 */

import { getFileExtension } from './file-utils'

export const MAX_UPLOAD_CONCURRENCY = 4

export const MAX_UPLOAD_FILE_SIZE_MB = 200
export const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024

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
