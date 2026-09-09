import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { KBFormatDistributionItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 文件类型分布 */
export type GetKnowledgeBaseFormatDistributionParams = {
  kb_name: string | number;
};

export const getKnowledgeBaseFormatDistribution = (params: GetKnowledgeBaseFormatDistributionParams): Promise<KBFormatDistributionItem[]> => {
  const { kb_name } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/format-distribution`).then((res) => res.data);
};

export const getKnowledgeBaseFormatDistributionQueryOptions = (params: GetKnowledgeBaseFormatDistributionParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-knowledge-base-format-distribution', params],
    queryFn: () => getKnowledgeBaseFormatDistribution(params),
  });
};

type UseGetKnowledgeBaseFormatDistributionOptions = {
  params: GetKnowledgeBaseFormatDistributionParams;
  queryConfig?: QueryConfig<typeof getKnowledgeBaseFormatDistributionQueryOptions>;
};

export const useGetKnowledgeBaseFormatDistribution = (options: UseGetKnowledgeBaseFormatDistributionOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getKnowledgeBaseFormatDistributionQueryOptions(params),
    ...queryConfig,
  });
};