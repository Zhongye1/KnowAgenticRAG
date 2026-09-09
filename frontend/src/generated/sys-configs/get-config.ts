import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetConfigDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取参数配置详情 */
export type GetConfigParams = {
  pk: string | number;
};

export const getConfig = (params: GetConfigParams): Promise<GetConfigDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/configs/${pk}`).then((res) => res.data);
};

export const getConfigQueryOptions = (params: GetConfigParams) => {
  return queryOptions({
    queryKey: ['sys-configs', 'get-config', params],
    queryFn: () => getConfig(params),
  });
};

type UseGetConfigOptions = {
  params: GetConfigParams;
  queryConfig?: QueryConfig<typeof getConfigQueryOptions>;
};

export const useGetConfig = (options: UseGetConfigOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getConfigQueryOptions(params),
    ...queryConfig,
  });
};