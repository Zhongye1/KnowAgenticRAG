/**
 * 个人空间切片的对外接口。其余层只从这里引用个人空间能力，不深入 `api` / `model` 内部。
 */
export {
  MAX_UPLOAD_FILE_COUNT,
  createWorkspaceDirectory,
  deleteWorkspaceEntry,
  downloadWorkspaceEntry,
  fetchWorkspaceFile,
  listWorkspaceEntries,
  saveWorkspaceFile,
  searchWorkspaceEntries,
  uploadWorkspaceFiles,
} from './api/workspace-api';
export {
  WORKSPACE_QUERY_ROOT,
  useWorkspaceEntries,
  useWorkspaceSearch,
  workspaceEntriesQueryKey,
  workspaceSearchQueryKey,
} from './model/workspace-queries';
export type { WorkspaceEntriesQuery } from './model/workspace-queries';
export {
  useCreateWorkspaceDirectory,
  useDeleteWorkspaceEntry,
  useSaveWorkspaceFile,
  useUploadWorkspaceFiles,
} from './model/workspace-mutations';
