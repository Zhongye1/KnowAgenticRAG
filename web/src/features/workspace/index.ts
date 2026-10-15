/**
 * 个人空间切片的对外接口。页面只从这里引用。
 */
export { useWorkspaceBrowser } from './model/use-workspace-browser';
export type {
  WorkspaceBrowser,
  WorkspaceBrowserInput,
  WorkspacePreview,
} from './model/use-workspace-browser';
export {
  QUICK_ACCESS,
  WORKSPACE_ROOT_LABEL,
  isQuickAccessPath,
  isWorkspaceRoot,
  pruneSelection,
} from './lib/workspace-view';
export type { QuickAccessItem, WorkspaceRow } from './lib/workspace-view';
export {
  formatFileSize,
  formatRelativeTime,
  isEditableWorkspaceFile,
} from './lib/file-format';
export { AgentsGuideDialog } from './ui/agents-guide-dialog';
export { CreateDirectoryDialog } from './ui/create-directory-dialog';
export { WorkspaceFileTable } from './ui/workspace-file-table';
export { WorkspacePreviewPane } from './ui/workspace-preview-pane';
export { WorkspaceSearchModal } from './ui/workspace-search-modal';
export { WorkspaceSidebar } from './ui/workspace-sidebar';
