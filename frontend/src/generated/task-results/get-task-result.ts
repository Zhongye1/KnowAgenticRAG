import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetTaskResultDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取任务结果详情 */
export type GetTaskResultParams = {
  pk: string | number;
};

export const getTaskResult = (params: GetTaskResultParams): Promise<GetTaskResultDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/task-results/${pk}`).then((res) => res.data);
};

export const getTaskResultQueryOptions = (params: GetTaskResultParams) => {
  return queryOptions({
    queryKey: ['task-results', 'get-task-result', params],
    queryFn: () => getTaskResult(params),
  });
};

type UseGetTaskResultOptions = {
  params: GetTaskResultParams;
  queryConfig?: QueryConfig<typeof getTaskResultQueryOptions>;
};

export const useGetTaskResult = (options: UseGetTaskResultOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getTaskResultQueryOptions(params),
    ...queryConfig,
  });
};