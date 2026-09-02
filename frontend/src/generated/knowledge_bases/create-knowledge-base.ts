import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { KBCreateParam, KBDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建知识库 */

export const createKnowledgeBase = (data: KBCreateParam): Promise<KBDetail> => {
  return api.post(`/api/v1/knowledge_bases`, data).then((res) => res.data);
};

type UseCreateKnowledgeBaseOptions = {
  mutationConfig?: MutationConfig<typeof createKnowledgeBase>;
};

export const useCreateKnowledgeBase = ({ mutationConfig }: UseCreateKnowledgeBaseOptions = {}) => {
  return useMutation({
    mutationFn: createKnowledgeBase,
    ...mutationConfig,
  });
};