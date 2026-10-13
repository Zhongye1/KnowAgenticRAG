/**
 * 可选智能体列表的查询层。
 *
 * 契约没声明响应模型，原始列表的归一在 `lib/agent-options.ts`（buildAgentOptions）；
 * 这里持有 query key 的唯一事实，页面与侧边栏共用同一份缓存。
 */
import { useQuery } from '@tanstack/react-query';

import { buildAgentOptions } from '../lib/agent-options';
import type { AgentOption } from '../lib/agent-options';
import { listAgents } from '../api/agents-api';

/** 可选智能体列表的 query key；归一后的选项列表见 `useAgentOptions`。 */
export const AGENTS_QUERY_KEY = ['chat', 'agents'] as const;

/** 归一后的可选智能体列表；加载中返回 `null`，由调用方决定加载态。 */
export const useAgentOptions = (): {
  options: AgentOption[];
  isLoading: boolean;
} => {
  const query = useQuery({ queryKey: AGENTS_QUERY_KEY, queryFn: listAgents });
  return {
    options: buildAgentOptions(query.data),
    isLoading: query.isPending,
  };
};
