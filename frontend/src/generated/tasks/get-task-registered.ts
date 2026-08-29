import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { TaskRegisteredDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取已注册的任务 */

export const getTaskRegistered = (): Promise<TaskRegisteredDetail[]> => {
  return api.get(`/api/v1/tasks/registered`).then((res) => res.data);
};

export const getTaskRegisteredQueryOptions = () => {
  return queryOptions({
    queryKey: ['tasks', 'get-task-registered'],
    queryFn: () => getTaskRegistered(),
  });
};

type UseGetTaskRegisteredOptions = {
  queryConfig?: QueryConfig<typeof getTaskRegisteredQueryOptions>;
};

export const useGetTaskRegistered = ({ queryConfig }: UseGetTaskRegisteredOptions = {}) => {
  return useQuery({
    ...getTaskRegisteredQueryOptions(),
    ...queryConfig,
  });
};