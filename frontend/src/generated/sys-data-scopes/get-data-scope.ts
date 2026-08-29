import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDataScopeDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取数据范围详情 */
export type GetDataScopeParams = {
  pk: string | number;
};

export const getDataScope = (params: GetDataScopeParams): Promise<GetDataScopeDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/data-scopes/${pk}`).then((res) => res.data);
};

export const getDataScopeQueryOptions = (params: GetDataScopeParams) => {
  return queryOptions({
    queryKey: ['sys-data-scopes', 'get-data-scope', params],
    queryFn: () => getDataScope(params),
  });
};

type UseGetDataScopeOptions = {
  params: GetDataScopeParams;
  queryConfig?: QueryConfig<typeof getDataScopeQueryOptions>;
};

export const useGetDataScope = (options: UseGetDataScopeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDataScopeQueryOptions(params),
    ...queryConfig,
  });
};