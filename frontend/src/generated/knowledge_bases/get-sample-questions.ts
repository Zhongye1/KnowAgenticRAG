import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 示例问题（Phase 4） */
export type GetSampleQuestionsParams = {
  kb_name: string | number;
};

export const getSampleQuestions = (params: GetSampleQuestionsParams): Promise<string[]> => {
  const { kb_name } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/sample-questions`).then((res) => res.data);
};

export const getSampleQuestionsQueryOptions = (params: GetSampleQuestionsParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-sample-questions', params],
    queryFn: () => getSampleQuestions(params),
  });
};

type UseGetSampleQuestionsOptions = {
  params: GetSampleQuestionsParams;
  queryConfig?: QueryConfig<typeof getSampleQuestionsQueryOptions>;
};

export const useGetSampleQuestions = (options: UseGetSampleQuestionsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getSampleQuestionsQueryOptions(params),
    ...queryConfig,
  });
};