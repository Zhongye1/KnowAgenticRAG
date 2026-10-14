/**
 * 当前智能体的配置投影。
 *
 * 提及候选取它做过滤，后续的模型选择器也读同一份：`configurable_items` 是每个配置项的
 * 形状，`agentConfig` 是补齐默认值之后的当前取值。
 *
 * 详情端点的路径参数虽然叫 `agent_id`，值其实是 slug，因此这里直接收会话里那个 `agentSlug`。
 */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { getAgentDetail } from '@/entities/agent';

import {
  applyConfigDefaults,
  asRecord,
  readAgentContext,
} from '../lib/agent-config';

/** 一个智能体一份配置；slug 就是详情端点的路径参数，因此直接用它当键。 */
const agentConfigQueryKey = (agentSlug: string) =>
  ['chat', 'agent-config', agentSlug] as const;

export type AgentConfigProjection = {
  /** 每个配置项的形状（类型、可选项、默认值）。 */
  configurableItems: Record<string, unknown>;
  /** 补齐默认值后的当前配置值。 */
  agentConfig: Record<string, unknown>;
  isLoading: boolean;
};

const EMPTY: AgentConfigProjection = {
  configurableItems: {},
  agentConfig: {},
  isLoading: false,
};

/** 读不到时不猜：返回空配置，调用方据此不给候选。 */
export const useAgentConfig = (
  agentSlug: string | undefined,
): AgentConfigProjection => {
  const query = useQuery({
    queryKey: agentConfigQueryKey(agentSlug ?? ''),
    queryFn: () => getAgentDetail(agentSlug as string),
    enabled: Boolean(agentSlug),
  });

  return React.useMemo(() => {
    if (!query.data)
      return { ...EMPTY, isLoading: Boolean(agentSlug) && query.isLoading };

    const configurableItems = asRecord(query.data.configurable_items);

    return {
      configurableItems,
      agentConfig: applyConfigDefaults(
        configurableItems,
        readAgentContext(query.data),
      ),
      isLoading: false,
    };
  }, [agentSlug, query.data, query.isLoading]);
};
