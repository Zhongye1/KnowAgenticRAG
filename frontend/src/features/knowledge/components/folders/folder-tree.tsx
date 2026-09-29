import { ChevronRight } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * 通用树组件（React 版）。
 *
 * **契约对齐 Yuxi `FileTreeComponent.vue`**（`web/src/components/FileTreeComponent.vue`）：
 * 那是个 antd `<a-tree>` 的薄封装，可迁移的不是它的代码而是**接口形状与行为约定**——
 *
 * | Yuxi props / events | 本组件 |
 * | --- | --- |
 * | `treeData` | `treeData` |
 * | `loadData`（懒加载子节点） | `loadData`（异步，节点级 loading 态） |
 * | `selectedKeys` / `update:selectedKeys` | `selectedKey` / `onSelect` |
 * | `expandedKeys` / `update:expandedKeys` | 内部维护（`defaultExpandedKeys` 可设初值） |
 * | `nodeClick` / `toggleFolder` | `onNodeClick`（点文件夹即展开/收起） |
 * | `#icon` / `#title` / `#actions` 插槽 | `renderIcon` / `renderTitle` / `renderActions` |
 * | 操作区 `@click.stop` | 操作区容器上 stopPropagation |
 *
 * 关键行为（与 Yuxi 一致）：**点击文件夹节点既选中也切换展开**，而点击操作按钮
 * 不应触发选中——所以操作区必须阻断冒泡。
 */

export type TreeNode = {
  /** 节点唯一键（文件夹用 folder_id，根节点约定为 `__root__`） */
  key: string;
  title: string;
  /** 是否为叶子（文件夹 = false，文档 = true） */
  isLeaf?: boolean;
  children?: TreeNode[];
  /** 子节点尚未加载（配合 loadData 懒加载） */
  hasUnloadedChildren?: boolean;
};

export type FolderTreeProps = {
  treeData: TreeNode[];
  selectedKey?: string | null;
  defaultExpandedKeys?: string[];
  /** 懒加载子节点：调用方负责把结果并入 treeData */
  loadData?: (node: TreeNode) => Promise<void>;
  renderIcon?: (node: TreeNode, expanded: boolean) => ReactNode;
  renderTitle?: (node: TreeNode) => ReactNode;
  /** 节点右侧操作区（悬停显示）；其内部点击不会触发选中 */
  renderActions?: (node: TreeNode) => ReactNode;
  onSelect?: (key: string, node: TreeNode) => void;
  onNodeClick?: (node: TreeNode, expanded: boolean) => void;
  emptyText?: string;
};

const INDENT_PX = 14;

export function FolderTree({
  treeData,
  selectedKey,
  defaultExpandedKeys = [],
  loadData,
  renderIcon,
  renderTitle,
  renderActions,
  onSelect,
  onNodeClick,
  emptyText = '暂无内容',
}: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedKeys),
  );
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(() => new Set());

  const toggle = useCallback(
    async (node: TreeNode) => {
      const isExpanded = expanded.has(node.key);
      setExpanded((current) => {
        const next = new Set(current);
        if (isExpanded) next.delete(node.key);
        else next.add(node.key);
        return next;
      });
      // 首次展开且子节点未加载时拉取（对应 Yuxi 的 internalLoadData）
      if (!isExpanded && loadData && node.hasUnloadedChildren) {
        setLoadingKeys((current) => new Set(current).add(node.key));
        try {
          await loadData(node);
        } finally {
          setLoadingKeys((current) => {
            const next = new Set(current);
            next.delete(node.key);
            return next;
          });
        }
      }
    },
    [expanded, loadData],
  );

  const handleNodeClick = (node: TreeNode) => {
    onSelect?.(node.key, node);
    const isFolder = node.isLeaf !== true;
    if (isFolder) {
      void toggle(node);
      onNodeClick?.(node, !expanded.has(node.key));
    }
  };

  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode => (
    <ul className="flex flex-col">
      {nodes.map((node) => {
        const isFolder = node.isLeaf !== true;
        const isExpanded = expanded.has(node.key);
        const isLoading = loadingKeys.has(node.key);
        const children = node.children ?? [];
        return (
          <li key={node.key}>
            <div
              role="treeitem"
              aria-selected={selectedKey === node.key}
              aria-expanded={isFolder ? isExpanded : undefined}
              tabIndex={0}
              onClick={() => handleNodeClick(node)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleNodeClick(node);
                }
              }}
              className={cn(
                'group flex h-8 cursor-pointer items-center gap-1 rounded-medium pr-1 text-xs transition-colors',
                selectedKey === node.key
                  ? 'bg-color-bg-2 text-foreground'
                  : 'text-muted-foreground hover:bg-color-bg-2 hover:text-foreground',
              )}
              style={{ paddingLeft: `${depth * INDENT_PX + 4}px` }}
            >
              {isFolder ? (
                <ChevronRight
                  className={cn(
                    'size-3.5 shrink-0 transition-transform',
                    isExpanded && 'rotate-90',
                    isLoading && 'animate-pulse',
                  )}
                />
              ) : (
                <span className="size-3.5 shrink-0" />
              )}
              {renderIcon ? renderIcon(node, isExpanded) : null}
              <span className="min-w-0 flex-1 truncate">
                {renderTitle ? renderTitle(node) : node.title}
              </span>
              {/* 操作区阻断冒泡：点删除/重命名不该顺带切换选中与展开 */}
              {renderActions ? (
                <span
                  className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {renderActions(node)}
                </span>
              ) : null}
            </div>
            {isFolder && isExpanded && children.length > 0
              ? renderNodes(children, depth + 1)
              : null}
          </li>
        );
      })}
    </ul>
  );

  if (treeData.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div role="tree" className="w-full">
      {renderNodes(treeData, 0)}
    </div>
  );
}
