import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { ChatParam, ChatResponse } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 知识库问答：检索 + chat 模型非流式回答 */
export type ChatKnowledgeBaseParams = {
  kb_name: string | number;
  data: ChatParam;
};

export const chatKnowledgeBase = (params: ChatKnowledgeBaseParams): Promise<ChatResponse> => {
  const { kb_name, data } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/chat`, data).then((res) => res.data);
};

type UseChatKnowledgeBaseOptions = {
  mutationConfig?: MutationConfig<typeof chatKnowledgeBase>;
};

export const useChatKnowledgeBase = ({ mutationConfig }: UseChatKnowledgeBaseOptions = {}) => {
  return useMutation({
    mutationFn: chatKnowledgeBase,
    ...mutationConfig,
  });
};