import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { KBItem, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 知识库列表 */
export type GetKnowledgeBasesParams = {
  query?: string | null;
  sort?: string;
  page?: number;
  size?: number;
};

export const getKnowledgeBases = (params: GetKnowledgeBasesParams): Promise<PageData<KBItem>> => {
  const { query, sort, page, size } = params;
  return api.get(`/api/v1/knowledge_bases`, { params: { query, sort, page, size } }).then((res) => res.data);
};

export const getKnowledgeBasesQueryOptions = (params: GetKnowledgeBasesParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-knowledge-bases', params],
    queryFn: () => getKnowledgeBases(params),
  });
};

type UseGetKnowledgeBasesOptions = {
  params: GetKnowledgeBasesParams;
  queryConfig?: QueryConfig<typeof getKnowledgeBasesQueryOptions>;
};

export const useGetKnowledgeBases = (options: UseGetKnowledgeBasesOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getKnowledgeBasesQueryOptions(params),
    ...queryConfig,
  });
};