import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { KBOverview } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 跨知识库聚合 */

export const getKnowledgeBasesOverview = (): Promise<KBOverview> => {
  return api.get(`/api/v1/knowledge_bases/overview`).then((res) => res.data);
};

export const getKnowledgeBasesOverviewQueryOptions = () => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-knowledge-bases-overview'],
    queryFn: () => getKnowledgeBasesOverview(),
  });
};

type UseGetKnowledgeBasesOverviewOptions = {
  queryConfig?: QueryConfig<typeof getKnowledgeBasesOverviewQueryOptions>;
};

export const useGetKnowledgeBasesOverview = ({ queryConfig }: UseGetKnowledgeBasesOverviewOptions = {}) => {
  return useQuery({
    ...getKnowledgeBasesOverviewQueryOptions(),
    ...queryConfig,
  });
};