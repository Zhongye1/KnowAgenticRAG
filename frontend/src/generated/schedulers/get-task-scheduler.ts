import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetTaskSchedulerDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取任务调度详情 */
export type GetTaskSchedulerParams = {
  pk: string | number;
};

export const getTaskScheduler = (params: GetTaskSchedulerParams): Promise<GetTaskSchedulerDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/schedulers/${pk}`).then((res) => res.data);
};

export const getTaskSchedulerQueryOptions = (params: GetTaskSchedulerParams) => {
  return queryOptions({
    queryKey: ['schedulers', 'get-task-scheduler', params],
    queryFn: () => getTaskScheduler(params),
  });
};

type UseGetTaskSchedulerOptions = {
  params: GetTaskSchedulerParams;
  queryConfig?: QueryConfig<typeof getTaskSchedulerQueryOptions>;
};

export const useGetTaskScheduler = (options: UseGetTaskSchedulerOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getTaskSchedulerQueryOptions(params),
    ...queryConfig,
  });
};