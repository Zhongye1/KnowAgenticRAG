/**
 * 可选智能体列表的查询层。
 *
 * 列表的读取与 query key 由 `entities/agent` 拥有（`useAgents`），这里只把它映射成对话页
 * 需要的选项形状；页面与侧边栏因此共用同一份缓存。
 */
import { useAgents } from '@/entities/agent';

import { buildAgentOptions } from '../lib/agent-options';
import type { AgentOption } from '../lib/agent-options';

/** 归一后的可选智能体列表；加载中返回空数组，由调用方决定加载态。 */
export const useAgentOptions = (): {
  options: AgentOption[];
  isLoading: boolean;
} => {
  const { agents, isLoading } = useAgents();

  return { options: buildAgentOptions(agents), isLoading };
};
