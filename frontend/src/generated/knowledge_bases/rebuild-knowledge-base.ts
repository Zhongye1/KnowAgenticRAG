import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 重建索引 */
export type RebuildKnowledgeBaseParams = {
  kb_name: string | number;
};

export const rebuildKnowledgeBase = (params: RebuildKnowledgeBaseParams): Promise<unknown> => {
  const { kb_name } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/rebuild`).then((res) => res.data);
};

type UseRebuildKnowledgeBaseOptions = {
  mutationConfig?: MutationConfig<typeof rebuildKnowledgeBase>;
};

export const useRebuildKnowledgeBase = ({ mutationConfig }: UseRebuildKnowledgeBaseOptions = {}) => {
  return useMutation({
    mutationFn: rebuildKnowledgeBase,
    ...mutationConfig,
  });
};