/**
 * 右侧面板文件树的纯逻辑。
 *
 * 对齐参照的 `FileTreeComponent.vue`、`AgentPanel.vue` 里的树相关脚本，以及
 * `utils/agentPanelFilesystemPolling.js`、`utils/agentPanelSections.js` 的两个判定：
 * 刷新门（按线程单飞、合并待办、只在请求线程仍是当前线程时提交）与轮询判定
 * （面板打开、页面可见、正在生成，且当前分区需要看到文件系统变化）。
 *
 * 树的节点键用接口给的原始路径：目录路径带尾斜杠，比较时才归一（比较规则在
 * `@/shared/lib/workspace-path`，个人空间页面共用）。
 */
import type { FileEntry } from '@/shared/lib/filesystem-entry';
import { isSameOrChildPath } from '@/shared/lib/workspace-path';

import type { PanelTreeScope } from '../api/filesystem-api';
import type { PanelSection } from './panel-sections';

/** 两套树的作用域；它们互相独立、切换保活。 */
export const PANEL_TREE_SCOPES = [
  { key: 'thread', label: '对话目录' },
  { key: 'workspace', label: '个人空间' },
] as const;

export type { PanelTreeScope };

/** 轮询间隔；与参照同值。 */
export const FILESYSTEM_REFRESH_INTERVAL_MS = 1000;

/** 根刷新时预取的目录名；它们的子项决定空目录是否展示。 */
export const PREFETCH_DIRECTORY_NAMES = ['outputs', 'uploads'];

/** 空的时候不展示的目录名。 */
export const HIDE_WHEN_EMPTY_NAMES = ['outputs', 'uploads'];

export type TreeNode = {
  key: string;
  title: string;
  /** 文件名拆成两段，中间省略用；目录与短名整段都在 `nameStart`。 */
  nameStart: string;
  nameEnd: string;
  isLeaf: boolean;
  children?: TreeNode[];
  fileData: Record<string, unknown> & {
    path: string;
    name: string;
    type: 'file' | 'directory';
    workdir: boolean;
  };
  className: string;
};

/** 取路径最后一段作为展示名；根与空路径都显示 `/`。 */
export function buildDisplayName(fullPath: unknown): string {
  const normalized = String(fullPath ?? '').replace(/\/+$/, '');
  if (!normalized || normalized === '/') return '/';

  const parts = normalized.split('/').filter(Boolean);

  return parts[parts.length - 1] || normalized;
}

/** 目录在前，再按名称排；用 `zh-Hans-CN` 排序，与参照同。 */
export function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((left, right) => {
    if (left.isDir !== right.isDir) return left.isDir ? -1 : 1;

    return buildDisplayName(left.path)
      .toLowerCase()
      .localeCompare(buildDisplayName(right.path).toLowerCase(), 'zh-Hans-CN');
  });
}

/** 文件名超过这个长度才拆两段。 */
const NAME_SPLIT_THRESHOLD = 5;

/**
 * 把一个条目变成树节点。
 *
 * 文件名的最后 5 个字符单独成段，是为了在窄面板里做「中间省略」：尾部（通常是扩展名）永远可见。
 */
export function createTreeNode(
  entry: FileEntry,
  extraFileData: Record<string, unknown> = {},
): TreeNode {
  const fullPath = String(entry?.path ?? '');
  const title = buildDisplayName(fullPath);
  const isLeaf = !entry?.isDir;

  let nameStart = title;
  let nameEnd = '';
  if (isLeaf && title.length > NAME_SPLIT_THRESHOLD) {
    nameEnd = title.slice(-NAME_SPLIT_THRESHOLD);
    nameStart = title.slice(0, -NAME_SPLIT_THRESHOLD);
  }

  return {
    key: fullPath,
    title,
    nameStart,
    nameEnd,
    isLeaf,
    children: isLeaf ? undefined : [],
    fileData: {
      ...entry,
      path: fullPath,
      name: title,
      type: isLeaf ? 'file' : 'directory',
      workdir: isLeaf,
      ...extraFileData,
    },
    className: isLeaf ? 'file-node' : 'folder-node',
  };
}

/** 个人空间树的节点：预览与下载走个人空间身份，而不是当前对话。 */
export const createWorkspaceTreeNode = (entry: FileEntry): TreeNode =>
  createTreeNode(entry, { workdir: false, workspace: true });

/** 就地替换某个目录的子项；目标不在树里时原样返回。 */
export function updateTreeChildren(
  nodes: TreeNode[],
  targetKey: string,
  children: TreeNode[],
): TreeNode[] {
  return nodes.map((node) => {
    if (node.key === targetKey) return { ...node, children };
    if (!node.children?.length) return node;

    return {
      ...node,
      children: updateTreeChildren(node.children, targetKey, children),
    };
  });
}

/** 移除某个节点（含它的子树）。 */
export function removeTreeNode(
  nodes: TreeNode[],
  targetKey: string,
): TreeNode[] {
  const result: TreeNode[] = [];

  for (const node of nodes) {
    if (node.key === targetKey) continue;

    result.push(
      node.children?.length
        ? { ...node, children: removeTreeNode(node.children, targetKey) }
        : node,
    );
  }

  return result;
}

/** 树里有没有这个键。 */
export function treeContainsKey(nodes: TreeNode[], targetKey: string): boolean {
  return nodes.some(
    (node) =>
      node.key === targetKey ||
      Boolean(
        node.children?.length && treeContainsKey(node.children, targetKey),
      ),
  );
}

/**
 * 重载已展开目录的子项，返回新的树。
 *
 * 按路径层级从浅到深处理：先拿到父目录的新子项，子目录的节点对象才是这一轮的新对象。单个目录
 * 读失败时保留上一轮的 children——一个目录瞬时不可读不该让整棵已展开的树清空。
 */
export async function refreshExpandedTree(
  nodes: TreeNode[],
  expandedKeys: string[],
  loadChildren: (directoryPath: string) => Promise<TreeNode[]>,
  alreadyLoadedKeys: string[] = [],
): Promise<TreeNode[]> {
  let refreshed = nodes;
  const loadedKeys = new Set(alreadyLoadedKeys);
  const directoryKeys = [...new Set(expandedKeys)].sort(
    (left, right) =>
      String(left).split('/').length - String(right).split('/').length,
  );

  for (const key of directoryKeys) {
    if (loadedKeys.has(key)) continue;
    if (!treeContainsKey(refreshed, key)) continue;

    try {
      refreshed = updateTreeChildren(refreshed, key, await loadChildren(key));
    } catch {
      // 保留上一轮 children
    }
  }

  return refreshed;
}

/** 静默刷新保留展开状态；非静默刷新（切线程、手动刷新）回到全收起。 */
export const expandedKeysAfterFilesystemRefresh = (
  currentKeys: string[],
  { silent }: { silent: boolean },
): string[] => (silent ? currentKeys : []);

/**
 * 把预取结果并进根节点：`outputs` / `uploads` 为空时整个隐藏，非关键目录照常展示。
 */
export function applyPrefetchedVisibility(
  nodes: TreeNode[],
  prefetched: Array<{ key: string; children: TreeNode[] | null }>,
): { nodes: TreeNode[]; prefetchedKeys: string[] } {
  const prefetchedByKey = new Map(
    prefetched.map((entry) => [entry.key, entry.children]),
  );
  const prefetchedKeys = prefetched
    .filter((entry) => entry.children !== null)
    .map((entry) => entry.key);

  const visible = nodes.reduce<TreeNode[]>((result, node) => {
    if (!prefetchedByKey.has(node.key)) {
      result.push(node);
      return result;
    }

    const children = prefetchedByKey.get(node.key);
    // `null` 表示这一轮没取到子项（预取失败）：保留原节点，不能当成空目录隐藏掉
    if (children === null) {
      result.push(node);
      return result;
    }

    if (!children?.length && HIDE_WHEN_EMPTY_NAMES.includes(node.title)) {
      return result;
    }

    result.push({ ...node, children: children ?? [] });

    return result;
  }, []);

  return { nodes: visible, prefetchedKeys };
}

/**
 * 刷新门。
 *
 * 同一个线程同时只允许一次刷新在飞，期间再来的请求合并成一次待办（`ensure` 时才合并）；提交前
 * 用 `canCommit` 核对请求发出时的线程是否仍是当前线程，避免切线程后旧响应盖住新树。
 */
export function createFilesystemRefreshGate() {
  const inFlight = new Set<string>();
  const pending = new Set<string>();

  return {
    begin(
      threadId: string,
      { ensure = false }: { ensure?: boolean } = {},
    ): boolean {
      const key = String(threadId ?? '');
      if (!key) return false;

      if (inFlight.has(key)) {
        if (ensure) pending.add(key);
        return false;
      }

      inFlight.add(key);
      return true;
    },

    /** 结束一次刷新；返回期间是否攒下了待办（调用方据此再跑一次）。 */
    finish(threadId: string): boolean {
      const key = String(threadId ?? '');
      inFlight.delete(key);

      return pending.delete(key);
    },

    canCommit(requestedThreadId: string, currentThreadId: string): boolean {
      return (
        Boolean(requestedThreadId) && requestedThreadId === currentThreadId
      );
    },
  };
}

/**
 * 什么时候该轮询文件系统。
 *
 * 三个条件同时成立才有意义：面板打开（看不见就没必要）、页面可见（后台标签页不轮询）、正在生成
 * （只有生成过程会写文件）。再看当前分区：文件树本身要看变化；文件预览只有预览的是**对话目录**里的
 * 文件时才看——个人空间的文件不随生成变化。
 */
export function shouldPollPanelFilesystem(input: {
  panelOpen: boolean;
  pageVisible: boolean;
  streaming: boolean;
  activeSection: PanelSection | undefined;
  activePreview: { workdir?: boolean } | null | undefined;
}): boolean {
  if (!input.panelOpen || !input.pageVisible || !input.streaming) return false;
  if (input.activeSection?.type === 'file-tree') return true;

  return (
    input.activeSection?.type === 'file' &&
    input.activePreview?.workdir === true
  );
}

/** 删除节点后清理选中与展开状态，并交出要关闭的预览路径。 */
export function treeStateAfterDelete(
  selectedKeys: string[],
  expandedKeys: string[],
  deletedPath: string,
): {
  selectedKeys: string[];
  expandedKeys: string[];
  closedPreviewPath: string;
} {
  return {
    selectedKeys: selectedKeys.filter(
      (key) => !isSameOrChildPath(key, deletedPath),
    ),
    expandedKeys: expandedKeys.filter(
      (key) => !isSameOrChildPath(key, deletedPath),
    ),
    closedPreviewPath: deletedPath,
  };
}
