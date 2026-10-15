/** 文件与流处理的对外接口；消费方从这里引用，不深入单个模块。 */
export { saveBlobAsFile, parseDownloadFilename } from './file-download';
export { resolveFileIconUrl } from './file-icon';
export { getPreviewFileExtension } from './file-preview';
export type { PreviewFile } from './file-preview';
export { toFileEntries, toFileEntry } from './filesystem-entry';
export type { FileEntry } from './filesystem-entry';
export { isSameOrChildPath, isSamePath, normalizePathKey, pathBreadcrumbs } from './workspace-path';
export { processSseResponse } from './sse';
