import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetConfigDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取所有参数配置 */
export type GetAllConfigsParams = {
  type?: string | null;
};

export const getAllConfigs = (params: GetAllConfigsParams): Promise<GetConfigDetail[]> => {
  const { type } = params;
  return api.get(`/api/v1/sys/configs/all`, { params: { type } }).then((res) => res.data);
};

export const getAllConfigsQueryOptions = (params: GetAllConfigsParams) => {
  return queryOptions({
    queryKey: ['sys-configs', 'get-all-configs', params],
    queryFn: () => getAllConfigs(params),
  });
};

type UseGetAllConfigsOptions = {
  params: GetAllConfigsParams;
  queryConfig?: QueryConfig<typeof getAllConfigsQueryOptions>;
};

export const useGetAllConfigs = (options: UseGetAllConfigsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getAllConfigsQueryOptions(params),
    ...queryConfig,
  });
};