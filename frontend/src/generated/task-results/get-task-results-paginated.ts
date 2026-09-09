import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetTaskResultDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有任务结果 */
export type GetTaskResultsPaginatedParams = {
  name?: string | null;
  task_id?: string | null;
  page?: number;
  size?: number;
};

export const getTaskResultsPaginated = (params: GetTaskResultsPaginatedParams): Promise<PageData<GetTaskResultDetail>> => {
  const { name, task_id, page, size } = params;
  return api.get(`/api/v1/task-results`, { params: { name, task_id, page, size } }).then((res) => res.data);
};

export const getTaskResultsPaginatedQueryOptions = (params: GetTaskResultsPaginatedParams) => {
  return queryOptions({
    queryKey: ['task-results', 'get-task-results-paginated', params],
    queryFn: () => getTaskResultsPaginated(params),
  });
};

type UseGetTaskResultsPaginatedOptions = {
  params: GetTaskResultsPaginatedParams;
  queryConfig?: QueryConfig<typeof getTaskResultsPaginatedQueryOptions>;
};

export const useGetTaskResultsPaginated = (options: UseGetTaskResultsPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getTaskResultsPaginatedQueryOptions(params),
    ...queryConfig,
  });
};