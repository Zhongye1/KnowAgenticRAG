/**
 * 面板里的文件树。
 *
 * 两套树（对话目录 / 个人空间）共用这个组件：区别只在是否带节点动作（下载与删除只在对话目录有），
 * 以及空态文案。目录点击展开或收起，并按需加载子项；文件点击交回调用方去打开预览。
 * 结构对齐参照 AgentPanel.vue 的树段：彩色类型图标（FileTypeIcon）、单目录图标、
 * hover 显示 24px 动作钮（下载主色 / 删除红）。
 */
import * as React from 'react';
import { ChevronDown, ChevronRight, Download, Loader2, Trash2 } from 'lucide-react';
import { resolveFileIconUrl } from '@/shared/lib/file-icon';
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
  onDelete?: (node: TreeNode) => void;
  onDownload?: (node: TreeNode) => void;
  /** 手动刷新；给了才显示重试入口。 */
  onRetry?: () => void;
};

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

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const expanded = expandedKeys.includes(node.key);
    const deleting = deletingPaths.includes(node.key);
    const selected = selectedKeys.includes(node.key);
    const isDir = !node.isLeaf;

    return (
      <li key={node.key}>
        <div
          role="treeitem"
          aria-selected={selected}
          aria-expanded={isDir ? expanded : undefined}
          className={`group/row ${styles.nodeRow} ${selected ? styles.nodeRowSelected : ''}`}
          style={{ paddingLeft: depth * 14 + 4 }}
          onClick={() => {
            if (node.isLeaf) {
              onNodeClick(node);
              return;
            }
            onLoadChildren(node);
            onNodeClick(node);
          }}
        >
          {/* 目录行：小号箭头 + 18px 彩色目录图标（参照隐藏 switcher 的做法）；
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
                  aria-label={node.isLeaf ? `删除文件 ${node.title}` : `删除文件夹 ${node.title}`}
                  disabled={deleting}
                  onClick={() => onDelete(node)}
                >
                  {deleting ? (
                    <Loader2 className={`${styles.nodeActionIcon} ${styles.nodeSpin}`} aria-hidden />
                  ) : (
                    <Trash2 className={styles.nodeActionIcon} aria-hidden />
                  )}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>

        {isDir && expanded && node.children?.length ? (
          <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <ul role="tree" aria-label={emptyText} className={styles.list}>
      {nodes.map((node) => renderNode(node, 0))}
    </ul>
  );
};

export { FileTree, type FileTreeProps };
