/**
 * 对话页右侧面板的分区渲染。
 *
 * 从 chat-page.tsx 拆出的装配：把 AgentPanel 的 `renderSection` 回调落成具体分区
 * （状态 / 子智能体 / 文件预览 / 文件树），动作通过回调交回页面，本组件不持有
 * 分区列表与预览状态。
 */
import * as React from 'react';

import {
  AgentPanel,
  FilePreview,
  FileTree,
  Input,
  PANEL_TREE_SCOPES,
  StatePanel,
  SubagentThreadView,
  readAgentStateArtifacts,
  readAgentStateFiles,
  readAgentStateTodos,
  readSubagentRuns,
  readTokenUsage,
  subagentRunTitle,
  type PanelSection,
  type PreviewFile,
  type TreeNode,
} from '@/features/chat';

type TreeScopeState = {
  nodes: TreeNode[];
  selectedKeys: string[];
  expandedKeys: string[];
  loading: boolean;
  error: string | null;
  deletingPaths: string[];
};

export type ChatSidePanelProps = {
  sections: PanelSection[];
  activeSectionKey: string;
  maximized: boolean;
  width: number | string;
  onActivateSection: (key: string) => void;
  /** 关闭一个分区（分区列表与激活键的更新都在 hook 里完成）。 */
  onCloseSection: (key: string) => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  onResize: (clientX: number) => void;
  /** 拖拽结束：把拖拽期的像素宽回写成持久比例。 */
  onResizeEnd: () => void;
  /** 调试分区兜底内容。 */
  children?: React.ReactNode;
  /** 状态分区读取 agent_state 用（后端自由 JSON）。 */
  agentState: unknown;
  /** 打开线程文件的预览分区（来自状态分区的产物/文件列表）。 */
  onOpenPreviewFile: (path: string, name: string) => void;
  /** 打开子智能体线程分区。 */
  onOpenSubagent: (run: {
    runId: string | null;
    childThreadId: string;
    name: string;
    status: string | undefined;
  }) => void;
  /** 文件预览分区：下载与关闭由页面处理（预览状态在 model 层）。 */
  previewFile: PreviewFile | null;
  onPreviewDownload: (file: { path: string; name: string }) => void;
  onPreviewClose: (sectionKey: string) => void;
  /** 文件树分区：作用域、搜索与文件系统状态由页面持有。 */
  treeScope: 'thread' | 'workspace';
  onTreeScopeChange: (scope: 'thread' | 'workspace') => void;
  fileSearchQuery: string;
  onFileSearchQueryChange: (query: string) => void;
  fileSearchResults: Array<{ path: string; name: string }> | undefined;
  scopeState: TreeScopeState;
  onPreviewOpen: (scope: 'thread' | 'workspace', path: string, name: string) => void;
  onPreviewDownloadByScope: (
    scope: 'thread' | 'workspace',
    path: string,
    name: string,
  ) => void;
  onNodeExpand: (node: {
    key: string;
    isLeaf: boolean;
    title: string;
    [k: string]: unknown;
  }) => void;
  onLoadChildren: (node: TreeNode) => void;
  onDeleteNode: (node: TreeNode) => void;
  onRetryTree: () => void;
};

export const ChatSidePanel = ({
  sections,
  activeSectionKey,
  maximized,
  width,
  onActivateSection,
  onCloseSection,
  onToggleMaximize,
  onClose,
  onResize,
  onResizeEnd,
  children,
  agentState,
  onOpenPreviewFile,
  onOpenSubagent,
  previewFile,
  onPreviewDownload,
  onPreviewClose,
  treeScope,
  onTreeScopeChange,
  fileSearchQuery,
  onFileSearchQueryChange,
  fileSearchResults,
  scopeState,
  onPreviewOpen,
  onPreviewDownloadByScope,
  onNodeExpand,
  onLoadChildren,
  onDeleteNode,
  onRetryTree,
}: ChatSidePanelProps) => {
  const renderSection = (section: PanelSection): React.ReactNode | undefined => {
    if (section.type === 'state') {
      const artifacts = readAgentStateArtifacts(agentState);
      const artifactFiles = artifacts.map((path) => ({
        key: path,
        path,
        name: path.split('/').filter(Boolean).pop() || path,
      }));
      return (
        <StatePanel
          tokenUsage={readTokenUsage(agentState)}
          todos={readAgentStateTodos(agentState)}
          files={readAgentStateFiles(agentState)}
          artifacts={artifactFiles}
          subagentRuns={readSubagentRuns(agentState)}
          onOpenFile={(file) => {
            onOpenPreviewFile(file.path, file.name);
          }}
          onOpenSubagent={(run) => {
            if (!run.child_thread_id) return;
            onOpenSubagent({
              runId: run.run_id ?? null,
              childThreadId: run.child_thread_id,
              name: subagentRunTitle(run),
              status: run.status,
            });
          }}
        />
      );
    }
    if (section.type === 'subagent' && section.threadId) {
      return (
        <SubagentThreadView
          childThreadId={section.threadId}
          runId={section.runId}
          runStatus={section.runStatus}
          active={section.key === activeSectionKey}
        />
      );
    }
    if (section.type === 'file') {
      return (
        <FilePreview
          file={previewFile}
          onDownload={(file) => onPreviewDownload(file)}
          onClose={() => onPreviewClose(section.key)}
        />
      );
    }
    if (section.type !== 'file-tree') return undefined;

    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--gray-150)] px-2 py-1">
          <Input
            value={fileSearchQuery}
            onChange={(event) => onFileSearchQueryChange(event.target.value)}
            placeholder={
              treeScope === 'workspace'
                ? '搜索个人空间的文件...'
                : '搜索当前对话的文件...'
            }
            aria-label="搜索文件"
          />
          {fileSearchQuery.trim() && fileSearchResults?.length ? (
            <ul className="mt-1 max-h-48 overflow-y-auto">
              {fileSearchResults.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    className="w-full truncate rounded-small px-2 py-1 text-left text-xs hover:bg-[var(--gray-100)]"
                    title={entry.path}
                    onClick={() => {
                      onFileSearchQueryChange('');
                      onPreviewOpen(
                        treeScope,
                        entry.path,
                        entry.name ||
                          entry.path.split('/').filter(Boolean).pop() ||
                          entry.path,
                      );
                    }}
                  >
                    {entry.name || entry.path}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div
          role="tablist"
          aria-label="文件树作用域"
          className="flex gap-1 border-b border-[var(--gray-150)] px-2 py-1"
        >
          {PANEL_TREE_SCOPES.map((scope) => (
            <button
              key={scope.key}
              type="button"
              role="tab"
              aria-selected={treeScope === scope.key}
              // 带上作用域限定：左侧导航也有「个人空间」，裸文本会撞名
              aria-label={`文件树作用域 ${scope.label}`}
              className={`rounded-small px-2 py-0.5 text-xs ${
                treeScope === scope.key
                  ? 'bg-[var(--gray-100)] text-[var(--gray-1000)]'
                  : 'text-[var(--gray-500)]'
              }`}
              onClick={() => onTreeScopeChange(scope.key)}
            >
              {scope.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FileTree
            nodes={scopeState.nodes}
            selectedKeys={scopeState.selectedKeys}
            expandedKeys={scopeState.expandedKeys}
            loading={scopeState.loading}
            error={scopeState.error}
            deletingPaths={scopeState.deletingPaths}
            emptyText={
              treeScope === 'workspace' ? '个人空间为空' : '对话目录为空'
            }
            loadingText={
              treeScope === 'workspace'
                ? '正在加载个人空间...'
                : '正在加载对话目录...'
            }
            showActions={treeScope === 'thread'}
            onDownload={(node) =>
              onPreviewDownloadByScope(treeScope, node.key, node.title)
            }
            onNodeClick={(node) => {
              if (node.isLeaf) {
                // 打开（或激活）这个文件的预览分区
                onPreviewOpen(treeScope, node.key, node.title);
                return;
              }
              // 展开或收起
              onNodeExpand(node);
            }}
            onLoadChildren={onLoadChildren}
            onDelete={onDeleteNode}
            onRetry={onRetryTree}
          />
        </div>
      </div>
    );
  };

  return (
    <AgentPanel
      sections={sections}
      activeSectionKey={activeSectionKey}
      maximized={maximized}
      width={width}
      onActivateSection={onActivateSection}
      onCloseSection={onCloseSection}
      onToggleMaximize={onToggleMaximize}
      onClose={onClose}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      renderSection={renderSection}
    >
      {children}
    </AgentPanel>
  );
};
