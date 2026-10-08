/** 知识库切片的对外接口。页面与其它切片只从这里引用。 */
export { KnowledgeList } from './ui/knowledge-list';
export { KnowledgeFormDialog } from './ui/knowledge-form-dialog';
export { KnowledgeFileTable } from './ui/knowledge-file-table';
export type { FileCrumb, FileLocation, FileView } from './model/file-view';
export {
  buildSearchHitLocation,
  openLocation,
  UNKNOWN_DIR_CRUMB,
} from './model/file-view';
export { FileSearchModal } from './ui/file-search-modal';
export { FileDetailDialog } from './ui/file-detail-dialog';
export { FileUploadDialog } from './ui/file-upload-dialog';
export { QueryTestPanel } from './ui/query-test-panel';
export { ShareConfigDialog } from './ui/share-config-dialog';
export { FilePreview as FilePreviewPane } from './ui/file-preview';
export {
  useAddDocuments,
  useCreateKnowledgeBase,
  useDeleteKnowledgeFile,
  useDeleteKnowledgeFiles,
  useFileContent,
  useFilePreview,
  useKnowledgeQueryParams,
  useOcrOptions,
  useSampleQuestions,
  useShareTargets,
  useSupportedFileTypes,
  useIndexKnowledgeFiles,
  useMoveKnowledgeFile,
  useParseKnowledgeFiles,
  useKnowledgeBase,
  useDeleteKnowledgeBase,
  useEmbeddingModels,
  useKnowledgeBases,
  useKnowledgeTypes,
  useUpdateKnowledgeBase,
} from './model/knowledge-queries';
export { knowledgeApi } from './api/knowledge-api';
export type {
  CreateKnowledgeBasePayload,
  KnowledgeBatchDeleteResult,
  KnowledgeFileChunk,
  KnowledgeFileContent,
  DepartmentOption,
  QueryTestChunk,
  UserAccessOption,
  OcrEngine,
  OcrOptions,
  UploadedKnowledgeFile,
  KnowledgeDeleteResult,
  KnowledgeTaskResult,
  KnowledgeFileItem,
  KnowledgeFileSearchItem,
  GroupedModels,
  KnowledgeBase,
  KnowledgeBaseDetail,
  KnowledgeBaseStats,
  KnowledgeTypeInfo,
  KnowledgeTypeParam,
  ShareConfig,
  ShareScope,
  UpdateKnowledgeBasePayload,
} from './api/knowledge-api';
export {
  canDeleteFile,
  canDownloadFile,
  canIndexFile,
  canParseFile,
  canReindexFile,
  canSelectFile,
  FILE_ACTIONS,
  FILE_PAGE_SIZE_OPTIONS,
  FILE_STATUS_FILTER_OPTIONS,
  formatContentCount,
  formatDirname,
  formatFileTableTime,
  formatSearchResultTime,
  getFilePrimaryAction,
  getFileStatusSortWeight,
  getFileStatusView,
  isProcessingFile,
  parseDownloadFilename,
  splitFilename,
} from './lib/knowledge-files';
export type {
  FileActionType,
  FileCapabilityTarget,
  FileDetailView,
  FilePrimaryAction,
} from './lib/knowledge-files';
export {
  canOpenFileDetail,
  canPreviewChunks,
  canPreviewOriginal,
  canPreviewParsed,
  getDefaultDetailView,
} from './lib/knowledge-files';
export {
  describeShareConfig,
  isManageScopeWithinRead,
  normalizeShareConfig,
  normalizeShareScope,
  validateShareConfig,
} from './lib/share-config';
export type { AccessLevel } from './lib/share-config';
export { buildQueryMeta } from './lib/knowledge-query-params';
export type {
  KnowledgeQueryParams,
  QueryParamChoice,
  QueryParamOption,
} from './lib/knowledge-query-params';
export {
  getCodeLanguageByPath,
  getPreviewFileExtension,
  getPreviewTypeByPath,
  normalizeCodeLanguage,
} from './lib/file-preview';
export type { FilePreview, PreviewType } from './lib/file-preview';
export {
  buildAddDocumentsParams,
  DEFAULT_SUPPORTED_TYPES,
  getFileExtension,
  getUploadFilename,
  hasOcrImages,
  MAX_UPLOAD_BYTES,
  needsOcr,
  runUploadPool,
  UPLOAD_CONCURRENCY,
  UPLOAD_TOO_LARGE_MESSAGE,
  validateUploadBatch,
} from './lib/knowledge-upload';
export type {
  UploadedFile,
  UploadRejection,
  UploadResult,
  UploadStatus,
} from './lib/knowledge-upload';
export type { ChunkRecord, MergedChunk } from './lib/knowledge-chunks';
export {
  DEFAULT_CHUNK_PRESET_ID,
  buildCreateRequest,
  createDefaultShareConfig,
  createEmptyKnowledgeBaseForm,
  createParamValues,
  selectKnowledgeBaseType,
  validateKnowledgeBaseForm,
} from './lib/knowledge-form';
export type { KnowledgeBaseForm } from './lib/knowledge-form';
export {
  formatBytes,
  formatCount,
  getKbTypeLabel,
  parseShanghai,
} from './lib/knowledge-view';
