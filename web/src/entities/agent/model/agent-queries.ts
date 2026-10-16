/**
 * 智能体列表与后端列表的查询层。
 *
 * query key 与 queryFn 由 `api/agents-api.ts` 从契约生成物导出（生成物只能被 api 段引用），
 * `select` 在这里把响应体归一成领域对象，UI 侧口径不变。失效用同一份 key 前缀（按 `_id` 匹配），
 * 覆盖 `includeSubagents` 的两份缓存。
 */
import { useQuery } from '@tanstack/react-query';

import {
  agentBackendsListOptions,
  agentsListOptions,
} from '../api/agents-api';
import { toAgentBackends, toAgents } from './agent-types';
import type { Agent, AgentBackend } from './agent-types';

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
    ...agentsListOptions(includeSubagents),
    select: (payload) => toAgents(payload.agents),
  });

  return {
    agents: query.data ?? [],
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
    ...agentBackendsListOptions(),
    select: (payload) => toAgentBackends(payload.backends),
  });

  return { backends: query.data ?? [], isLoading: query.isPending };
};
