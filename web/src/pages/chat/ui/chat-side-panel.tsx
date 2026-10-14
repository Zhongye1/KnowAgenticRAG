/**
 * 对话页右侧面板的分区渲染。
 *
 * 从 chat-page.tsx 拆出的装配：把 AgentPanel 的 `renderSection` 回调落成具体分区
 * （子智能体 / 文件预览 / 文件树），动作通过回调交回页面，本组件不持有分区列表与预览状态。
 *
 * 状态不在这里：参照把它放在独立的 `.side-panel--state` 上，本仓对应
 * `chat-page-view.tsx` 里的状态面板。
 */
import * as React from 'react';
import { RotateCw } from 'lucide-react';

import { AutoComplete, Breadcrumb, Segmented } from 'antd';

import {
  AgentPanel,
  FilePreview,
  FileTree,
  PANEL_TREE_SCOPES,
  SubagentThreadView,
  type PanelSection,
  type PreviewFile,
  type TreeNode,
} from '@/features/chat';
import { pathBreadcrumbs } from '@/shared/lib/workspace-path';

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
  onPreviewOpen: (
    scope: 'thread' | 'workspace',
    path: string,
    name: string,
  ) => void;
  onPreviewDownloadByScope: (
    scope: 'thread' | 'workspace',
    path: string,
    name: string,
  ) => void;
  /** 面包屑点某一段：展开它的祖先并选中它（不动其它分支）。 */
  onSelectPath: (path: string) => void;
  onNodeExpand: (node: {
    key: string;
    isLeaf: boolean;
    title: string;
    [k: string]: unknown;
  }) => void;
  onLoadChildren: (node: TreeNode) => void;
  /** 展开键变化（键盘 ←/→）：受控展开态要由页面接住。 */
  onExpandedKeysChange: (keys: string[]) => void;
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
  onSelectPath,
  onNodeExpand,
  onLoadChildren,
  onExpandedKeysChange,
  onDeleteNode,
  onRetryTree,
}: ChatSidePanelProps) => {
  const renderSection = (
    section: PanelSection,
  ): React.ReactNode | undefined => {
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

    const scopeLabel =
      PANEL_TREE_SCOPES.find((scope) => scope.key === treeScope)?.label ?? '';
    const selectedPath = scopeState.selectedKeys[0] ?? '';
    const crumbs = pathBreadcrumbs(selectedPath);
    const openSearchResult = (path: string, name?: string) => {
      onFileSearchQueryChange('');
      onPreviewOpen(
        treeScope,
        path,
        name || path.split('/').filter(Boolean).pop() || path,
      );
    };

    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--gray-100)] px-2 py-1">
          <Segmented
            size="small"
            value={treeScope}
            aria-label="文件树作用域"
            options={PANEL_TREE_SCOPES.map((scope) => ({
              label: scope.label,
              value: scope.key,
            }))}
            onChange={(value) =>
              onTreeScopeChange(value as 'thread' | 'workspace')
            }
          />
        </div>

        <div className="border-b border-[var(--gray-100)] px-2 py-1">
          <div className="flex items-center gap-1">
            {/* 候选来自页面的防抖搜索，因此不再让组件本地过滤 */}
            <AutoComplete
              className="flex-1"
              value={fileSearchQuery}
              options={(fileSearchResults ?? []).map((entry) => ({
                value: entry.path,
                label: entry.name || entry.path,
              }))}
              filterOption={false}
              allowClear
              placeholder={
                treeScope === 'workspace'
                  ? '搜索个人空间的文件...'
                  : '搜索当前对话的文件...'
              }
              aria-label="搜索文件"
              onChange={(value) => onFileSearchQueryChange(value)}
              onSelect={(value) => {
                const entry = fileSearchResults?.find(
                  (item) => item.path === value,
                );
                openSearchResult(String(value), entry?.name);
              }}
            />
            {/* 参照 .tree-toolbar-actions 的刷新钮：手动重拉当前作用域的树。
                显式声明透明底：本仓不引 preflight，原生按钮不声明就会露出浏览器默认灰底 */}
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-small bg-transparent text-[var(--gray-500)] hover:bg-[var(--gray-50)] hover:text-[var(--gray-800)]"
              title={treeScope === 'workspace' ? '刷新个人空间' : '刷新文件'}
              aria-label={
                treeScope === 'workspace' ? '刷新个人空间' : '刷新文件'
              }
              onClick={onRetryTree}
            >
              <RotateCw size={15} aria-hidden />
            </button>
          </div>
        </div>

        {/* 面包屑：当前选中项的路径，点一段回到那一层。
            antd 的 item 无 href 时渲染成 span（不是 button），因此不会带上浏览器默认的
            按钮灰底；与参照的差异（12px、分隔线间距、末段加重）用外层 arbitrary variant 收口。 */}
        {crumbs.length > 0 ? (
          <Breadcrumb
            aria-label="当前路径"
            className="px-2 py-1 text-xs text-[var(--gray-500)] [&_.ant-breadcrumb-link]:inline-block [&_.ant-breadcrumb-link]:max-w-[10rem] [&_.ant-breadcrumb-link]:cursor-pointer [&_.ant-breadcrumb-link]:truncate [&_.ant-breadcrumb-link:hover]:text-[var(--gray-900)] [&_.ant-breadcrumb-item:last-child_.ant-breadcrumb-link]:font-medium [&_.ant-breadcrumb-item:last-child_.ant-breadcrumb-link]:text-[var(--gray-900)] [&_.ant-breadcrumb-separator]:mx-1 [&_.ant-breadcrumb-separator]:text-[var(--gray-300)]"
            items={[
              {
                title: scopeLabel,
                onClick: () => onSelectPath(crumbs[0]!.path),
              },
              ...crumbs.map((crumb) => ({
                title: crumb.name,
                onClick: () => onSelectPath(crumb.path),
              })),
            ]}
          />
        ) : null}

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
            onExpandedKeysChange={onExpandedKeysChange}
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
