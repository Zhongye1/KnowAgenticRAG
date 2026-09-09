import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { KBDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 知识库详情 */
export type GetKnowledgeBaseParams = {
  kb_name: string | number;
};

export const getKnowledgeBase = (params: GetKnowledgeBaseParams): Promise<KBDetail> => {
  const { kb_name } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}`).then((res) => res.data);
};

export const getKnowledgeBaseQueryOptions = (params: GetKnowledgeBaseParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-knowledge-base', params],
    queryFn: () => getKnowledgeBase(params),
  });
};

type UseGetKnowledgeBaseOptions = {
  params: GetKnowledgeBaseParams;
  queryConfig?: QueryConfig<typeof getKnowledgeBaseQueryOptions>;
};

export const useGetKnowledgeBase = (options: UseGetKnowledgeBaseOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getKnowledgeBaseQueryOptions(params),
    ...queryConfig,
  });
};