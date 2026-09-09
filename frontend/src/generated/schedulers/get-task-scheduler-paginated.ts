import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetTaskSchedulerDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有任务调度 */
export type GetTaskSchedulerPaginatedParams = {
  name?: string | null;
  type?: number | null;
  page?: number;
  size?: number;
};

export const getTaskSchedulerPaginated = (params: GetTaskSchedulerPaginatedParams): Promise<PageData<GetTaskSchedulerDetail>> => {
  const { name, type, page, size } = params;
  return api.get(`/api/v1/schedulers`, { params: { name, type, page, size } }).then((res) => res.data);
};

export const getTaskSchedulerPaginatedQueryOptions = (params: GetTaskSchedulerPaginatedParams) => {
  return queryOptions({
    queryKey: ['schedulers', 'get-task-scheduler-paginated', params],
    queryFn: () => getTaskSchedulerPaginated(params),
  });
};

type UseGetTaskSchedulerPaginatedOptions = {
  params: GetTaskSchedulerPaginatedParams;
  queryConfig?: QueryConfig<typeof getTaskSchedulerPaginatedQueryOptions>;
};

export const useGetTaskSchedulerPaginated = (options: UseGetTaskSchedulerPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getTaskSchedulerPaginatedQueryOptions(params),
    ...queryConfig,
  });
};