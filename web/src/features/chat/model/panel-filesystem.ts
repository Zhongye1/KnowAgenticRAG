/**
 * 面板文件系统的状态层。
 *
 * 两套树（对话目录 / 个人空间）互相独立、切换保活；树的状态由这里持有并就地更新——刷新、懒加载、
 * 删除都是局部改动，不做整棵重拉，这样展开状态才不会丢。
 *
 * 轮询由调用方给一个布尔值（页面上由「面板打开 + 页面可见 + 正在生成 + 当前分区」算出来），这里
 * 只负责按间隔触发静默刷新，并保证同一个线程同时只有一次在飞（刷新门）。
 */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  deleteEntry,
  listDirectory,
  searchEntries,
} from '../api/filesystem-api';
import {
  applyPrefetchedVisibility,
  createFilesystemRefreshGate,
  createTreeNode,
  createWorkspaceTreeNode,
  expandedKeysAfterFilesystemRefresh,
  FILESYSTEM_REFRESH_INTERVAL_MS,
  PREFETCH_DIRECTORY_NAMES,
  refreshExpandedTree,
  removeTreeNode,
  sortEntries,
  treeStateAfterDelete,
  updateTreeChildren,
  type PanelTreeScope,
  type TreeNode,
} from '../lib/panel-tree';

export type PanelTreeScopeState = {
  nodes: TreeNode[];
  selectedKeys: string[];
  expandedKeys: string[];
  loading: boolean;
  error: string | null;
  /** 正在删除的路径；节点动作据此禁用。 */
  deletingPaths: string[];
};

const emptyScopeState: PanelTreeScopeState = {
  nodes: [],
  selectedKeys: [],
  expandedKeys: [],
  loading: false,
  error: null,
  deletingPaths: [],
};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

/** 根刷新要预取的目录；取不到子项时按「没取到」处理，不当成空目录隐藏。 */
async function loadRootNodes(
  scope: PanelTreeScope,
  threadId?: string,
): Promise<{
  nodes: TreeNode[];
  prefetchedKeys: string[];
}> {
  const entries = await listDirectory({ scope, threadId, path: '/' });
  const roots = sortEntries(entries).map((entry) =>
    scope === 'workspace'
      ? createWorkspaceTreeNode(entry)
      : createTreeNode(entry),
  );

  const prefetched = await Promise.all(
    roots.map(async (node) => {
      if (!PREFETCH_DIRECTORY_NAMES.includes(node.title)) {
        return { key: node.key, children: null as TreeNode[] | null };
      }

      try {
        const children = await loadScopeChildren(scope, threadId, node.key);
        return { key: node.key, children };
      } catch {
        // 预取失败保留原节点：取不到子项不等于目录是空的
        return { key: node.key, children: null as TreeNode[] | null };
      }
    }),
  );

  return applyPrefetchedVisibility(roots, prefetched);
}

async function loadScopeChildren(
  scope: PanelTreeScope,
  threadId: string | undefined,
  directoryPath: string,
): Promise<TreeNode[]> {
  const entries = await listDirectory({ scope, threadId, path: directoryPath });

  return sortEntries(entries).map((entry) =>
    scope === 'workspace'
      ? createWorkspaceTreeNode(entry)
      : createTreeNode(entry),
  );
}

export type PanelFilesystem = {
  thread: PanelTreeScopeState;
  workspace: PanelTreeScopeState;
  /** 刷新对话目录；`silent` 保留展开状态，`ensure` 期间有刷新在飞时攒一次待办。 */
  refreshThreadTree: (options?: {
    silent?: boolean;
    ensure?: boolean;
  }) => Promise<void>;
  /** 懒加载一个目录的子项。 */
  loadThreadChildren: (node: TreeNode) => Promise<void>;
  /** 删除对话目录里的一个节点，成功后就地移除。 */
  deleteThreadNode: (node: TreeNode) => Promise<boolean>;
  /** 刷新个人空间；加载过就不重复拉，除非显式要求。 */
  refreshWorkspaceTree: (options?: { force?: boolean }) => Promise<void>;
  /** 懒加载个人空间的一个目录。 */
  loadWorkspaceChildren: (node: TreeNode) => Promise<void>;
  /** 选中与展开状态由调用方持有的一部分，这里提供更新入口。 */
  setScopeState: (
    scope: PanelTreeScope,
    updater: (current: PanelTreeScopeState) => PanelTreeScopeState,
  ) => void;
};

export const usePanelFilesystem = (options: {
  threadId?: string;
  /** 是否轮询；由页面按「面板打开 + 页面可见 + 正在生成 + 当前分区」算出来。 */
  pollingEnabled: boolean;
  /** 删除成功后的回调；页面用它关掉指向被删路径的预览分区。 */
  onDeleted?: (deletedPath: string) => void;
}): PanelFilesystem => {
  const threadId = options.threadId;
  const gate = React.useRef(createFilesystemRefreshGate()).current;
  const refreshingRef = React.useRef(false);
  // 个人空间加载过就不重复拉：切换作用域要保活
  const workspaceLoadedRef = React.useRef(false);

  const [thread, setThread] =
    React.useState<PanelTreeScopeState>(emptyScopeState);
  const [workspace, setWorkspace] =
    React.useState<PanelTreeScopeState>(emptyScopeState);

  const patchScope = React.useCallback(
    (scope: PanelTreeScope, changes: Partial<PanelTreeScopeState>) => {
      const setState = scope === 'workspace' ? setWorkspace : setThread;
      setState((current) => ({ ...current, ...changes }));
    },
    [],
  );

  const refreshThreadTree = React.useCallback(
    async ({ silent = false, ensure = false } = {}) => {
      const requestedThreadId = threadId;
      // 这里线程相同 + 单飞已经覆盖同一件事：
      // 切线程会重置状态并让 canCommit 失败，在飞的刷新不会提交。
      if (!requestedThreadId) {
        setThread((current) => ({ ...current, nodes: [], error: null }));
        return;
      }
      if (!gate.begin(requestedThreadId, { ensure })) return;
      if (refreshingRef.current) return;
      refreshingRef.current = true;

      if (!silent) patchScope('thread', { loading: true });
      patchScope('thread', { error: null });

      try {
        const { nodes, prefetchedKeys } = await loadRootNodes(
          'thread',
          requestedThreadId,
        );
        let next = nodes;

        if (silent) {
          const current = thread;
          next = await refreshExpandedTree(
            nodes,
            current.expandedKeys,
            (directoryPath) =>
              loadScopeChildren('thread', requestedThreadId, directoryPath),
            prefetchedKeys,
          );
        }

        if (!gate.canCommit(requestedThreadId, threadId)) return;

        patchScope('thread', {
          nodes: next,
          expandedKeys: expandedKeysAfterFilesystemRefresh(
            thread.expandedKeys,
            {
              silent,
            },
          ),
          selectedKeys: [],
          error: null,
        });
      } catch (error) {
        if (!gate.canCommit(requestedThreadId, threadId)) return;
        patchScope('thread', {
          nodes: [],
          error: errorMessage(error, '加载文件系统失败'),
        });
      } finally {
        const refreshAgain = gate.finish(requestedThreadId);
        if (!silent) patchScope('thread', { loading: false });
        refreshingRef.current = false;
        if (refreshAgain) void refreshThreadTree({ silent: true });
      }
    },
    // thread 状态只用来读展开键：轮询刷新要保留它们
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threadId, patchScope, gate, thread],
  );

  const loadThreadChildren = React.useCallback(
    async (node: TreeNode) => {
      if (node.isLeaf || node.children?.length || !threadId) return;

      try {
        const children = await loadScopeChildren('thread', threadId, node.key);
        setThread((current) => ({
          ...current,
          nodes: updateTreeChildren(current.nodes, node.key, children),
        }));
      } catch (error) {
        // 单个目录读失败不清空整棵树
        console.warn('加载目录失败:', node.key, error);
      }
    },
    [threadId],
  );

  const deleteThreadNode = React.useCallback(
    async (node: TreeNode): Promise<boolean> => {
      if (!threadId) return false;

      patchScope('thread', {
        deletingPaths: [...thread.deletingPaths, node.key],
      });
      try {
        await deleteEntry({ scope: 'thread', threadId, path: node.key });
        setThread((current) => {
          const state = treeStateAfterDelete(
            current.selectedKeys,
            current.expandedKeys,
            node.key,
          );
          options.onDeleted?.(state.closedPreviewPath);

          return {
            ...current,
            nodes: removeTreeNode(current.nodes, node.key),
            selectedKeys: state.selectedKeys,
            expandedKeys: state.expandedKeys,
          };
        });
        return true;
      } catch (error) {
        patchScope('thread', { error: errorMessage(error, '删除失败') });
        return false;
      } finally {
        setThread((current) => ({
          ...current,
          deletingPaths: current.deletingPaths.filter(
            (path) => path !== node.key,
          ),
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threadId, thread.deletingPaths, patchScope],
  );

  const refreshWorkspaceTree = React.useCallback(
    async ({ force = false } = {}) => {
      if (workspaceLoadedRef.current && !force) return;

      patchScope('workspace', { loading: true, error: null });
      try {
        const { nodes } = await loadRootNodes('workspace');
        workspaceLoadedRef.current = true;
        setWorkspace((current) => ({
          ...current,
          nodes,
          loading: false,
          error: null,
        }));
      } catch (error) {
        setWorkspace((current) => ({
          ...current,
          loading: false,
          error: errorMessage(error, '加载个人空间失败'),
        }));
      }
    },
    [patchScope],
  );

  const loadWorkspaceChildren = React.useCallback(async (node: TreeNode) => {
    if (node.isLeaf || node.children?.length) return;

    try {
      const children = await loadScopeChildren(
        'workspace',
        undefined,
        node.key,
      );
      setWorkspace((current) => ({
        ...current,
        nodes: updateTreeChildren(current.nodes, node.key, children),
      }));
    } catch (error) {
      console.warn('加载目录失败:', node.key, error);
    }
  }, []);

  const setScopeState = React.useCallback(
    (
      scope: PanelTreeScope,
      updater: (current: PanelTreeScopeState) => PanelTreeScopeState,
    ) => {
      const setState = scope === 'workspace' ? setWorkspace : setThread;
      setState(updater);
    },
    [],
  );

  // 轮询：只在调用方判定需要时挂 interval；静默刷新保留展开状态
  React.useEffect(() => {
    if (!options.pollingEnabled) return;

    const timer = setInterval(() => {
      void refreshThreadTree({ silent: true });
    }, FILESYSTEM_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [options.pollingEnabled, refreshThreadTree]);

  // 切线程：回到全收起的空树，等下一次刷新；在飞的刷新会被 canCommit 拦下
  React.useEffect(() => {
    workspaceLoadedRef.current = false;
    setThread(emptyScopeState);
    setWorkspace(emptyScopeState);
  }, [threadId]);

  return {
    thread,
    workspace,
    refreshThreadTree,
    loadThreadChildren,
    deleteThreadNode,
    refreshWorkspaceTree,
    loadWorkspaceChildren,
    setScopeState,
  };
};

/** 按当前作用域搜索文件；查询词由调用方防抖。 */
export const usePanelFileSearch = (input: {
  scope: PanelTreeScope;
  threadId?: string;
  query: string;
  enabled: boolean;
}) =>
  useQuery({
    queryKey: [
      'chat',
      'panel-files',
      input.scope,
      input.threadId ?? '',
      input.query,
    ],
    queryFn: () =>
      searchEntries({
        scope: input.scope,
        threadId: input.threadId,
        query: input.query,
      }),
    enabled: input.enabled && input.query.trim().length > 0,
  });
