import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { ChatParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 知识库问答：检索 + chat 模型 SSE 流式回答 */
export type ChatKnowledgeBaseStreamParams = {
  kb_name: string | number;
  data: ChatParam;
};

export const chatKnowledgeBaseStream = (params: ChatKnowledgeBaseStreamParams): Promise<unknown> => {
  const { kb_name, data } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/chat/stream`, data).then((res) => res.data);
};

type UseChatKnowledgeBaseStreamOptions = {
  mutationConfig?: MutationConfig<typeof chatKnowledgeBaseStream>;
};

export const useChatKnowledgeBaseStream = ({ mutationConfig }: UseChatKnowledgeBaseStreamOptions = {}) => {
  return useMutation({
    mutationFn: chatKnowledgeBaseStream,
    ...mutationConfig,
  });
};