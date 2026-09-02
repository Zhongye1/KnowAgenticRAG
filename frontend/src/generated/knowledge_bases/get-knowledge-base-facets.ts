import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { KBFacetItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分面统计 */
export type GetKnowledgeBaseFacetsParams = {
  kb_name: string | number;
};

export const getKnowledgeBaseFacets = (params: GetKnowledgeBaseFacetsParams): Promise<KBFacetItem[]> => {
  const { kb_name } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/facets`).then((res) => res.data);
};

export const getKnowledgeBaseFacetsQueryOptions = (params: GetKnowledgeBaseFacetsParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-knowledge-base-facets', params],
    queryFn: () => getKnowledgeBaseFacets(params),
  });
};

type UseGetKnowledgeBaseFacetsOptions = {
  params: GetKnowledgeBaseFacetsParams;
  queryConfig?: QueryConfig<typeof getKnowledgeBaseFacetsQueryOptions>;
};

export const useGetKnowledgeBaseFacets = (options: UseGetKnowledgeBaseFacetsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getKnowledgeBaseFacetsQueryOptions(params),
    ...queryConfig,
  });
};