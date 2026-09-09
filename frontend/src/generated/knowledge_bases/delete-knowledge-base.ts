import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { KBDeleteResponse } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 级联删除知识库 */
export type DeleteKnowledgeBaseParams = {
  kb_name: string | number;
};

export const deleteKnowledgeBase = (params: DeleteKnowledgeBaseParams): Promise<KBDeleteResponse> => {
  const { kb_name } = params;
  return api.delete(`/api/v1/knowledge_bases/${kb_name}`).then((res) => res.data);
};

type UseDeleteKnowledgeBaseOptions = {
  mutationConfig?: MutationConfig<typeof deleteKnowledgeBase>;
};

export const useDeleteKnowledgeBase = ({ mutationConfig }: UseDeleteKnowledgeBaseOptions = {}) => {
  return useMutation({
    mutationFn: deleteKnowledgeBase,
    ...mutationConfig,
  });
};