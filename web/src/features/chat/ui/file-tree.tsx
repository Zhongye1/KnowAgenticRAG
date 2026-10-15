/**
 * 面板里的文件树。
 *
 * 两套树（对话目录 / 个人空间）共用这个组件：区别只在是否带节点动作（下载与删除只在对话目录有），
 * 以及空态文案。目录点击展开或收起，并按需加载子项；文件点击交回调用方去打开预览。
 *
 * 用 antd `Tree` 承载结构与键盘交互（↑↓ 移动、←→ 收起/展开、Home/End、`role="tree"` 与
 * 焦点管理都由组件给；展开态是受控的，因此 `onExpand` 必须把新的键交回调用方，
 * 否则 ←/→ 在受控模式下是空操作），节点行仍由本组件画：参照 AgentPanel.vue 的树段是彩色类型图标 +
 * 自绘 chevron + hover 显示 24px 动作钮，antd 自带的 switcher 与行样式因此在 CSS 里让位。
 */
import * as React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react';

import { Tree } from 'antd';
import type { TreeDataNode } from 'antd';

import { resolveFileIconUrl } from '@/shared/lib/files';

import styles from './file-tree.module.css';

import type { TreeNode } from '../lib/panel-tree';

type FileTreeProps = {
  nodes: TreeNode[];
  selectedKeys: string[];
  expandedKeys: string[];
  loading?: boolean;
  error?: string | null;
  emptyText: string;
  loadingText: string;
  /** 正在删除的路径；对应节点的删除按钮禁用。 */
  deletingPaths?: string[];
  /** 对话目录的节点才有下载与删除动作。 */
  showActions?: boolean;
  onNodeClick: (node: TreeNode) => void;
  onLoadChildren: (node: TreeNode) => void;
  /** 展开键变化（键盘 ←/→ 或点目录行）：受控展开态要由调用方接住。 */
  onExpandedKeysChange: (keys: string[]) => void;
  onDelete?: (node: TreeNode) => void;
  onDownload?: (node: TreeNode) => void;
  /** 手动刷新；给了才显示重试入口。 */
  onRetry?: () => void;
};

/** 树里按 key 找节点；antd 的回调只给 DataNode，拿不到我们的 `TreeNode`。 */
const findNode = (nodes: TreeNode[], key: string): TreeNode | undefined => {
  for (const node of nodes) {
    if (node.key === key) return node;
    const found = node.children?.length
      ? findNode(node.children, key)
      : undefined;
    if (found) return found;
  }

  return undefined;
};

/**
 * 转成 antd 的节点。
 *
 * 目录的 `children` 是空数组时传 `undefined`：那是「还没加载」而不是「没有子项」，
 * 传空数组 antd 会当成叶子、不再给展开入口。
 *
 * `aria-selected` 显式给出：rc-tree 只在节点声明了 `selectable` 时才渲染这个属性，
 * 而且渲染的是「这个节点可选」而不是「这个节点已选」——两个都不对。节点上的 aria-*
 * 会被透传到 treeitem 上，因此在这里按真实选中态给。
 */
/** antd 的 `DataNode` 类型不接受任意键，但 rc-tree 会把节点上的 aria-* 透传到 treeitem 上。 */
type FileTreeDataNode = TreeDataNode & { 'aria-selected': boolean };

const toDataNode = (
  node: TreeNode,
  selectedKeys: string[],
): FileTreeDataNode => ({
  key: node.key,
  isLeaf: node.isLeaf,
  'aria-selected': selectedKeys.includes(node.key),
  children: node.children?.length
    ? node.children.map((child) => toDataNode(child, selectedKeys))
    : undefined,
});

const FileTree = ({
  nodes,
  selectedKeys,
  expandedKeys,
  loading = false,
  error = null,
  emptyText,
  loadingText,
  deletingPaths = [],
  showActions = false,
  onNodeClick,
  onLoadChildren,
  onExpandedKeysChange,
  onDelete,
  onDownload,
  onRetry,
}: FileTreeProps) => {
  if (loading) {
    return <div className={styles.notice}>{loadingText}</div>;
  }

  if (error) {
    return (
      <div className={styles.errorBox}>
        <span>{error}</span>
        {onRetry ? (
          <button type="button" className={styles.retryBtn} onClick={onRetry}>
            重试
          </button>
        ) : null}
      </div>
    );
  }

  if (!nodes.length) {
    return <div className={styles.notice}>{emptyText}</div>;
  }

  const renderTitle = (node: TreeNode) => {
    const expanded = expandedKeys.includes(node.key);
    const deleting = deletingPaths.includes(node.key);
    const isDir = !node.isLeaf;

    return (
      <span className={styles.nodeRow}>
        {/* 目录行：自绘 chevron + 18px 彩色目录图标（antd 的 switcher 在 CSS 里隐藏）；
            文件行：16px 彩色类型图标 */}
        {isDir ? (
          <>
            {expanded ? (
              <ChevronDown className={styles.nodeChevron} aria-hidden />
            ) : (
              <ChevronRight className={styles.nodeChevron} aria-hidden />
            )}
            <img
              className={styles.nodeFolderIcon}
              src={resolveFileIconUrl(node.key, { isDir: true })}
              alt=""
              draggable={false}
            />
          </>
        ) : (
          <img
            className={styles.nodeFileIcon}
            src={resolveFileIconUrl(node.key, { isDir: false })}
            alt=""
            draggable={false}
          />
        )}

        <span className={styles.nodeTitle} title={node.title}>
          <span className={styles.nodeTitleStart}>{node.nameStart}</span>
          {node.nameEnd ? (
            <span className={styles.nodeTitleTail}>{node.nameEnd}</span>
          ) : null}
        </span>

        {showActions ? (
          <span
            className={styles.nodeActions}
            onClick={(event) => event.stopPropagation()}
          >
            {node.isLeaf && onDownload ? (
              <button
                type="button"
                className={`${styles.nodeActionBtn} ${styles.nodeDownloadBtn}`}
                aria-label={`下载 ${node.title}`}
                onClick={() => onDownload(node)}
              >
                <Download className={styles.nodeActionIcon} aria-hidden />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className={`${styles.nodeActionBtn} ${styles.nodeDeleteBtn}`}
                aria-label={
                  node.isLeaf
                    ? `删除文件 ${node.title}`
                    : `删除文件夹 ${node.title}`
                }
                disabled={deleting}
                onClick={() => onDelete(node)}
              >
                {deleting ? (
                  <Loader2
                    className={`${styles.nodeActionIcon} ${styles.nodeSpin}`}
                    aria-hidden
                  />
                ) : (
                  <Trash2 className={styles.nodeActionIcon} aria-hidden />
                )}
              </button>
            ) : null}
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <Tree
      className={styles.tree}
      treeData={nodes.map((node) => toDataNode(node, selectedKeys))}
      selectedKeys={selectedKeys}
      expandedKeys={expandedKeys}
      blockNode
      selectable
      // 参照的箭头是自绘的：让 antd 的 switcher 不占位
      switcherIcon={null}
      aria-label={emptyText}
      titleRender={(dataNode) => {
        const node = findNode(nodes, String(dataNode.key));

        return node ? renderTitle(node) : null;
      }}
      onExpand={(keys, info) => {
        onExpandedKeysChange(keys.map(String));
        // 键盘展开的目录同样按需拉子项；点行那条路径由 onSelect 负责
        if (!info.expanded) return;
        const node = findNode(nodes, String(info.node.key));
        if (node && !node.isLeaf) onLoadChildren(node);
      }}
      onSelect={(_keys, info) => {
        const node = findNode(nodes, String(info.node.key));
        if (!node) return;

        if (node.isLeaf) {
          onNodeClick(node);
          return;
        }
        // 目录：先按需拉子项，再交给调用方切换展开并选中
        onLoadChildren(node);
        onNodeClick(node);
      }}
    />
  );
};

export { FileTree, type FileTreeProps };
