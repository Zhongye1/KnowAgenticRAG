/** 聊天切片的对外接口。页面只从这里引用。 */
export { createChatRuntime, useChatRuntime } from './model/chat-runtime';
export type {
  ChatRuntime,
  ChatRuntimeOptions,
  SendQueuePolicy,
} from './model/chat-runtime';
export {
  disposeThreadRuntime,
  setThreadMessages,
  useThreadRuntime,
} from './model/thread-runtime-store';
export type { ThreadRuntimeState } from './model/thread-runtime-store';
export { agentRunApi } from './api/agent-api';
export { PendingInterruptPanel } from './ui/pending-interrupt-panel';
export { QueueBar } from './ui/queue-bar';
export { MessageDebugPanel } from './ui/message-debug-panel';
export {
  mergeMessageDebugMessages,
  type DebugMessage,
} from './lib/message-debug';
export { MessageList } from './ui/message-list';
export { ConversationList } from './ui/conversation-list';
export { useThreadList } from './model/thread-list-store';
export { useStreamingMessages } from './model/streamed-messages';
export {
  attachToolResults,
  splitStreamedChunks,
} from './lib/message-processor';
export type { StreamedChunk } from './lib/message-processor';
export {
  canSubmitDirectSteer,
  describeQueue,
  describeQueueRow,
  hasPendingDirectSteer,
} from './lib/queue-view';
export {
  DRAFT_THREAD_ID,
  createThreadDraftSession,
  createThreadDraftStore,
} from './lib/thread-draft';
export type { ThreadDraftSession, ThreadDraftStore } from './lib/thread-draft';
export {
  findClipboardImage,
  normalizeUploadedImage,
  validateImageFile,
} from './lib/image-upload';
export type { UploadedImage } from './lib/image-upload';
export { ImageAttachmentPreview } from './ui/image-attachment-preview';
export {
  isThreadWaitingForUserAction,
  isRunInterruptedConflict,
  isToolApprovalMode,
  readToolApprovalModePreference,
  resolveToolApprovalMode,
  writeToolApprovalModePreference,
} from './lib/tool-approval';
export type { ToolApprovalMode } from './lib/tool-approval';
export { ToolApprovalModeSelector } from './ui/tool-approval-mode-selector';
export { GlobalSearchModal } from './ui/global-search-modal';
export { TokenUsageCard } from './ui/token-usage-card';
export { readTokenUsage } from './lib/token-usage';
export { fetchAgentState } from './model/agent-state';
export type { PendingInterrupt } from './lib/pending-interrupt';
export type { AgentRun, ChatMessage, CreateRunResult } from './api/agent-api';
export { searchMentionFiles } from './api/mention-api';
export {
  buildMentionFileItems,
  buildMentionResourceItems,
} from './lib/mention-resources';
export type { MentionResourceItem } from './lib/mention-resources';
export { buildMentionConfig } from './lib/mention-config';
export { useAgentConfig } from './model/agent-config';
export {
  DRAFT_MODEL_KEY,
  formatModelSpecLabel,
  modelOverrideKey,
  resolveModelSpec,
} from './lib/model-spec';
export {
  useChatModels,
  useModelOverride,
  useModelSelection,
} from './model/model-selection';
export {
  useDefaultOcrEngine,
  useSystemConfig,
  useSystemDefaultModel,
} from './model/system-config';
export { ModelSelector } from './ui/model-selector';
export { AUTO_PROJECT_ID, resolveProjectId } from './lib/project-selection';
export { FILE_TREE_SECTION } from './lib/panel-sections';
export { PANEL_TREE_SCOPES, shouldPollPanelFilesystem } from './lib/panel-tree';
export {
  usePanelFileSearch,
  usePanelFilesystem,
} from './model/panel-filesystem';
export { FileTree } from './ui/file-tree';
export { FilePreview } from './ui/file-preview';
export { usePanelPreview } from './model/panel-preview';
export {
  HISTORY_SEARCH_DEBOUNCE_MS,
  useCreateLinkedProject,
  useDebouncedValue,
  useHistoryCandidates,
  useProjects,
} from './model/project-queries';
export { ProjectSelector } from './ui/project-selector';
export {
  MAX_ATTACHMENT_SIZE_BYTES,
  formatFileSize,
  pendingAttachmentFileIds,
  pendingThreadAttachments,
  type AttachmentItem,
  type AttachmentStatus,
  type ThreadAttachment,
} from './lib/attachment-upload';
export {
  attachmentKeys,
  useAttachmentUpload,
  useCacheThreadAttachments,
  useThreadAttachments,
} from './model/attachment-upload';
export type { AttachmentUpload } from './model/attachment-upload';
export { AttachmentUploadDialog } from './ui/attachment-upload';
export type { HistoryCandidate, ProjectItem } from './api/projects-api';
export type { ThreadRequest } from './api/agent-api';
export type { ChatModelGroup, ChatModelItem } from './api/model-api';
export type { QueueRowContext, QueueView } from './lib/queue-view';
export type { ConversationMessage } from './lib/message-processor';
export { buildMentionDisplayLabels } from './lib/mention-text';
export { ComposerOptions } from './ui/composer-options';
export { MentionEditor } from './ui/mention-editor';
export type { MentionEditorHandle } from './ui/mention-editor';
export { AgentPanel } from './ui/agent-panel';
export {
  closeSection,
  MESSAGE_DEBUG_SECTION,
  normalizeSections,
  upsertSection,
} from './lib/panel-sections';
export type { PanelSection } from './lib/panel-sections';
export type { TreeNode } from './lib/panel-tree';
export type { TokenUsage } from './lib/token-usage';
export type { PreviewFile } from '@/shared/lib/file-preview';
export { resizePanelWidth } from './lib/panel-width';
export {
  extractArtifactsFromConversation,
  normalizeArtifactItems,
} from './lib/artifacts';
export type { ArtifactItem } from './lib/artifacts';
export { ArtifactsCard } from './ui/artifacts-card';
export {
  downloadThreadArtifact,
  saveThreadArtifact,
} from './api/artifacts-api';
export type { Conversation } from './lib/message-processor';
export {
  readSubagentRuns,
  resolveTaskRunStatus,
  buildSubagentTaskView,
  buildSubagentLifecycleView,
} from './lib/subagent-run';
export type { SubagentRun } from './lib/subagent-run';
export { subagentRunTitle } from './lib/subagent-run';
export { SEND_COOLDOWN_MS } from './model/chat-runtime';
export { ScrollController } from './lib/scroll-controller';
export {
  useAgentPanelSections,
  subagentRunSection,
} from './model/panel-sections-store';
export { useImageUploadSlot } from './model/image-upload-slot';
export { useArtifactActions } from './model/artifact-actions';
export { useThreadDraftInput } from './model/thread-draft-input';
export { useAgentOptions } from './model/agent-options-queries';
export { SubagentThreadView } from './ui/subagent-thread-view';
export { buildReplyLoadingStatus } from './lib/reply-status';
export { GeneratingStatus } from './ui/generating-status';
export { generateConversationTitle } from './api/agent-api';
export { fallbackTitleFromQuery } from './lib/thread-title';
export { useFastModel } from './model/system-config';
export {
  readAgentStateTodos,
  readAgentStateFiles,
  readAgentStateArtifacts,
  readAgentStateSubagentRuns,
  hasVisibleStateSections,
} from './lib/agent-state-readers';
export type { AgentStateFile } from './lib/agent-state-readers';
export { StatePanel } from './ui/state-panel';
export { ContextUsageRing } from './ui/context-usage-ring';
export { buildAgentOptions } from './lib/agent-options';
export type { AgentOption } from './lib/agent-options';
export { AgentSelector } from './ui/agent-selector';
