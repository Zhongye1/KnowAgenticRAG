import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { AgentParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 知识库 Agent 问答：SSE 流式（step 轨迹 + 引用 + 逐帧回答） */
export type AgentKnowledgeBaseStreamParams = {
  kb_name: string | number;
  data: AgentParam;
};

export const agentKnowledgeBaseStream = (params: AgentKnowledgeBaseStreamParams): Promise<unknown> => {
  const { kb_name, data } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/agent/stream`, data).then((res) => res.data);
};

type UseAgentKnowledgeBaseStreamOptions = {
  mutationConfig?: MutationConfig<typeof agentKnowledgeBaseStream>;
};

export const useAgentKnowledgeBaseStream = ({ mutationConfig }: UseAgentKnowledgeBaseStreamOptions = {}) => {
  return useMutation({
    mutationFn: agentKnowledgeBaseStream,
    ...mutationConfig,
  });
};