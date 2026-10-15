/**
 * 智能体列表与后端列表的查询层。
 *
 * query key 的唯一事实在这里：对话页的候选列表、管理面板与页头统计都从这一份缓存读，只是
 * `includeSubagents` 不同（候选列表要排除子智能体，管理面板要按组展示它们）。
 */
import { useQuery } from '@tanstack/react-query';

import { listAgentBackends, listAgents } from '../api/agents-api';
import { toAgentBackends, toAgents } from './agent-types';
import type { Agent, AgentBackend } from './agent-types';

/** 列表的 query key；`includeSubagents` 不同就是两份数据。 */
export const agentsQueryKey = (includeSubagents: boolean) =>
  ['agents', { includeSubagents }] as const;

/** 全部智能体列表的 key 前缀；写入后失效用（含子智能体与不含子智能体两份）。 */
export const AGENTS_QUERY_ROOT = ['agents'] as const;

/** 后端列表的 query key。 */
export const agentBackendsQueryKey = ['agent-backends'] as const;

export type AgentsQuery = {
  agents: Agent[];
  isLoading: boolean;
  /** 含后台重取的请求中状态；刷新按钮的转动反馈用它。 */
  isFetching: boolean;
  error: unknown;
  /** 重新拉取；面板的刷新按钮与失败重试都用它。 */
  refetch: () => void;
};

/** 归一后的智能体列表；加载中 `agents` 为空数组，由调用方决定加载态。 */
export const useAgents = (includeSubagents = false): AgentsQuery => {
  const query = useQuery({
    queryKey: agentsQueryKey(includeSubagents),
    queryFn: () => listAgents({ includeSubagents }),
  });

  return {
    agents: toAgents(query.data),
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
};

/** 可选的后端列表；只在新建智能体时用到。 */
export const useAgentBackends = (): {
  backends: AgentBackend[];
  isLoading: boolean;
} => {
  const query = useQuery({
    queryKey: agentBackendsQueryKey,
    queryFn: listAgentBackends,
  });

  return {
    backends: toAgentBackends(query.data),
    isLoading: query.isPending,
  };
};
