import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { RagSearchParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** RAG 跨库检索 SSE（step/sources/done/error） */

export const ragSearchStream = (data: RagSearchParam): Promise<unknown> => {
  return api.post(`/api/v1/rag/search/stream`, data).then((res) => res.data);
};

type UseRagSearchStreamOptions = {
  mutationConfig?: MutationConfig<typeof ragSearchStream>;
};

export const useRagSearchStream = ({ mutationConfig }: UseRagSearchStreamOptions = {}) => {
  return useMutation({
    mutationFn: ragSearchStream,
    ...mutationConfig,
  });
};