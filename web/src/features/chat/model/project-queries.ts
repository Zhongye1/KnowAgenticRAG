/**
 * 项目列表、历史候选与创建。
 *
 * 历史候选按查询词分 key：换了词就是另一条查询，迟到的旧响应落在旧 key 上，不会覆盖当前结果
 * （参照用请求序号达到同一效果）。防抖由调用方在 250ms 上做。
 */
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createLinkedProject,
  listHistoryCandidates,
  listProjects,
  type HistoryCandidate,
  type ProjectItem,
} from '../api/projects-api';

/** 历史候选一次取多少条；与参照同值。 */
export const HISTORY_CANDIDATE_LIMIT = 20;

/** 历史候选搜索的防抖时长；与参照同值。 */
export const HISTORY_SEARCH_DEBOUNCE_MS = 250;

/**
 * 防抖后的值。
 *
 * 历史候选的搜索用它：每敲一个字就发一次请求既浪费又会和迟到响应抢结果。查询按词分 key，
 * 迟到的旧响应落在旧 key 上，因此这里只需要防抖，不需要再丢弃响应。
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export const projectKeys = {
  all: ['chat', 'projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
  history: (query: string) => [...projectKeys.all, 'history', query] as const,
};

/** 当前用户可选择的项目。 */
export const useProjects = () =>
  useQuery({ queryKey: projectKeys.list(), queryFn: listProjects });

/** 可作为新项目目录的历史对话。 */
export const useHistoryCandidates = (query: string) =>
  useQuery({
    queryKey: projectKeys.history(query),
    queryFn: () =>
      listHistoryCandidates({ query, limit: HISTORY_CANDIDATE_LIMIT }),
  });

/**
 * 新建 `linked` 项目。
 *
 * 成功后把新项目插到列表最前：列表已经加载过时不必再拉一次，而用户马上就要用它建线程。
 */
export const useCreateLinkedProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createLinkedProject,
    onSuccess: (project) => {
      queryClient.setQueryData<ProjectItem[]>(projectKeys.list(), (current) => [
        project,
        ...(current ?? []).filter((item) => item.id !== project.id),
      ]);
    },
  });
};

export type { HistoryCandidate, ProjectItem };
