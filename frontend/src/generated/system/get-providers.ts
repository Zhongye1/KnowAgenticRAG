import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { ModelProviderDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 模型供应商列表 */

export const getProviders = (): Promise<ModelProviderDetail[]> => {
  return api.get(`/api/v1/system/model-providers`).then((res) => res.data);
};

export const getProvidersQueryOptions = () => {
  return queryOptions({
    queryKey: ['system', 'get-providers'],
    queryFn: () => getProviders(),
  });
};

type UseGetProvidersOptions = {
  queryConfig?: QueryConfig<typeof getProvidersQueryOptions>;
};

export const useGetProviders = ({ queryConfig }: UseGetProvidersOptions = {}) => {
  return useQuery({
    ...getProvidersQueryOptions(),
    ...queryConfig,
  });
};