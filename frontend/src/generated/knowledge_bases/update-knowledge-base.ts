import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { KBDetail, KBUpdateParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新知识库 */
export type UpdateKnowledgeBaseParams = {
  kb_name: string | number;
  data: KBUpdateParam;
};

export const updateKnowledgeBase = (params: UpdateKnowledgeBaseParams): Promise<KBDetail> => {
  const { kb_name, data } = params;
  return api.patch(`/api/v1/knowledge_bases/${kb_name}`, data).then((res) => res.data);
};

type UseUpdateKnowledgeBaseOptions = {
  mutationConfig?: MutationConfig<typeof updateKnowledgeBase>;
};

export const useUpdateKnowledgeBase = ({ mutationConfig }: UseUpdateKnowledgeBaseOptions = {}) => {
  return useMutation({
    mutationFn: updateKnowledgeBase,
    ...mutationConfig,
  });
};