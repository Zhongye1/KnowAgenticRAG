import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { AgentParam, AgentResponse } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 知识库 Agent 问答：规划 + 工具检索 + 自省 + 非流式回答 */
export type AgentKnowledgeBaseParams = {
  kb_name: string | number;
  data: AgentParam;
};

export const agentKnowledgeBase = (params: AgentKnowledgeBaseParams): Promise<AgentResponse> => {
  const { kb_name, data } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/agent`, data).then((res) => res.data);
};

type UseAgentKnowledgeBaseOptions = {
  mutationConfig?: MutationConfig<typeof agentKnowledgeBase>;
};

export const useAgentKnowledgeBase = ({ mutationConfig }: UseAgentKnowledgeBaseOptions = {}) => {
  return useMutation({
    mutationFn: agentKnowledgeBase,
    ...mutationConfig,
  });
};