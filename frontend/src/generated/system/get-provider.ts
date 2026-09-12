import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { ModelProviderDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 模型供应商详情 */
export type GetProviderParams = {
  provider_id: string | number;
};

export const getProvider = (params: GetProviderParams): Promise<ModelProviderDetail> => {
  const { provider_id } = params;
  return api.get(`/api/v1/system/model-providers/${provider_id}`).then((res) => res.data);
};

export const getProviderQueryOptions = (params: GetProviderParams) => {
  return queryOptions({
    queryKey: ['system', 'get-provider', params],
    queryFn: () => getProvider(params),
  });
};

type UseGetProviderOptions = {
  params: GetProviderParams;
  queryConfig?: QueryConfig<typeof getProviderQueryOptions>;
};

export const useGetProvider = (options: UseGetProviderOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getProviderQueryOptions(params),
    ...queryConfig,
  });
};