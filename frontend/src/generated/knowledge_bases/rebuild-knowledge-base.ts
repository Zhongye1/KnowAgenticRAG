import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { RebuildResultItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** KB 级全量重摄取（D12：遍历文档复用 ingest 任务） */
export type RebuildKnowledgeBaseParams = {
  kb_name: string | number;
};

export const rebuildKnowledgeBase = (params: RebuildKnowledgeBaseParams): Promise<RebuildResultItem> => {
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