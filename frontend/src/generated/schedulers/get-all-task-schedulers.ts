import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetTaskSchedulerDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取所有任务调度 */

export const getAllTaskSchedulers = (): Promise<GetTaskSchedulerDetail[]> => {
  return api.get(`/api/v1/schedulers/all`).then((res) => res.data);
};

export const getAllTaskSchedulersQueryOptions = () => {
  return queryOptions({
    queryKey: ['schedulers', 'get-all-task-schedulers'],
    queryFn: () => getAllTaskSchedulers(),
  });
};

type UseGetAllTaskSchedulersOptions = {
  queryConfig?: QueryConfig<typeof getAllTaskSchedulersQueryOptions>;
};

export const useGetAllTaskSchedulers = ({ queryConfig }: UseGetAllTaskSchedulersOptions = {}) => {
  return useQuery({
    ...getAllTaskSchedulersQueryOptions(),
    ...queryConfig,
  });
};