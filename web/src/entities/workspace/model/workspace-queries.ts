/**
 * 个人空间目录的查询层。
 *
 * query key 的唯一事实在这里：个人空间页面按当前目录读；面板的树是命令式加载（它有自己的刷新门
 * 与轮询判定），不经过这层缓存。
 */
import { useQuery } from '@tanstack/react-query';

import {
  listWorkspaceEntries,
  searchWorkspaceEntries,
} from '../api/workspace-api';
import type { FileEntry } from '@/shared/lib/files';

/** 全部个人空间查询的 key 前缀；写入后按它失效。 */
export const WORKSPACE_QUERY_ROOT = ['workspace'] as const;

/** 某个目录的子项列表的 query key。 */
export const workspaceEntriesQueryKey = (path: string) =>
  [...WORKSPACE_QUERY_ROOT, 'entries', path] as const;

/** 按关键词搜索的 query key。 */
export const workspaceSearchQueryKey = (query: string) =>
  [...WORKSPACE_QUERY_ROOT, 'search', query] as const;

export type WorkspaceEntriesQuery = {
  entries: FileEntry[];
  /** 首次加载或换目录后还没有数据。 */
  isLoading: boolean;
  /** 含后台重新取数；目录切换后的旧数据在飞时为真。 */
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
};

/** 列出某个目录的子项；加载中 `entries` 为空数组，由调用方决定加载态。 */
export const useWorkspaceEntries = (path: string): WorkspaceEntriesQuery => {
  const query = useQuery({
    queryKey: workspaceEntriesQueryKey(path),
    queryFn: () => listWorkspaceEntries({ path }),
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
};

/** 搜索个人空间文件；空关键词不发请求（调用方决定防抖）。 */
export const useWorkspaceSearch = (
  query: string,
  enabled = true,
): { entries: FileEntry[]; isLoading: boolean; error: unknown } => {
  const keyword = query.trim();
  const result = useQuery({
    queryKey: workspaceSearchQueryKey(keyword),
    queryFn: () => searchWorkspaceEntries({ query: keyword }),
    enabled: enabled && keyword.length > 0,
  });

  return {
    entries: result.data ?? [],
    isLoading: result.isPending && keyword.length > 0,
    error: result.error,
  };
};
