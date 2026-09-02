import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { KBCollectionsItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 集合统计 */
export type GetKnowledgeBaseCollectionsParams = {
  kb_name: string | number;
};

export const getKnowledgeBaseCollections = (params: GetKnowledgeBaseCollectionsParams): Promise<KBCollectionsItem[]> => {
  const { kb_name } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/collections`).then((res) => res.data);
};

export const getKnowledgeBaseCollectionsQueryOptions = (params: GetKnowledgeBaseCollectionsParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-knowledge-base-collections', params],
    queryFn: () => getKnowledgeBaseCollections(params),
  });
};

type UseGetKnowledgeBaseCollectionsOptions = {
  params: GetKnowledgeBaseCollectionsParams;
  queryConfig?: QueryConfig<typeof getKnowledgeBaseCollectionsQueryOptions>;
};

export const useGetKnowledgeBaseCollections = (options: UseGetKnowledgeBaseCollectionsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getKnowledgeBaseCollectionsQueryOptions(params),
    ...queryConfig,
  });
};