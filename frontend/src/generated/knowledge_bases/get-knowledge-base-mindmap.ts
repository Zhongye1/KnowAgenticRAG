import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 知识导图（由 documents.structure 聚合） */
export type GetKnowledgeBaseMindmapParams = {
  kb_name: string | number;
};

export const getKnowledgeBaseMindmap = (params: GetKnowledgeBaseMindmapParams): Promise<unknown> => {
  const { kb_name } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/mindmap`).then((res) => res.data);
};

export const getKnowledgeBaseMindmapQueryOptions = (params: GetKnowledgeBaseMindmapParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-knowledge-base-mindmap', params],
    queryFn: () => getKnowledgeBaseMindmap(params),
  });
};

type UseGetKnowledgeBaseMindmapOptions = {
  params: GetKnowledgeBaseMindmapParams;
  queryConfig?: QueryConfig<typeof getKnowledgeBaseMindmapQueryOptions>;
};

export const useGetKnowledgeBaseMindmap = (options: UseGetKnowledgeBaseMindmapOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getKnowledgeBaseMindmapQueryOptions(params),
    ...queryConfig,
  });
};