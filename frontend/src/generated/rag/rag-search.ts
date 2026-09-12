import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { RagSearchOutput, RagSearchParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** RAG 跨库检索（sources 二元来源 + steps 轨迹） */

export const ragSearch = (data: RagSearchParam): Promise<RagSearchOutput> => {
  return api.post(`/api/v1/rag/search`, data).then((res) => res.data);
};

type UseRagSearchOptions = {
  mutationConfig?: MutationConfig<typeof ragSearch>;
};

export const useRagSearch = ({ mutationConfig }: UseRagSearchOptions = {}) => {
  return useMutation({
    mutationFn: ragSearch,
    ...mutationConfig,
  });
};