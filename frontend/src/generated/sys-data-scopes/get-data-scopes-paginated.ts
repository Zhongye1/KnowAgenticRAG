import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDataScopeDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有数据范围 */
export type GetDataScopesPaginatedParams = {
  name?: string | null;
  status?: number | null;
  page?: number;
  size?: number;
};

export const getDataScopesPaginated = (params: GetDataScopesPaginatedParams): Promise<PageData<GetDataScopeDetail>> => {
  const { name, status, page, size } = params;
  return api.get(`/api/v1/sys/data-scopes`, { params: { name, status, page, size } }).then((res) => res.data);
};

export const getDataScopesPaginatedQueryOptions = (params: GetDataScopesPaginatedParams) => {
  return queryOptions({
    queryKey: ['sys-data-scopes', 'get-data-scopes-paginated', params],
    queryFn: () => getDataScopesPaginated(params),
  });
};

type UseGetDataScopesPaginatedOptions = {
  params: GetDataScopesPaginatedParams;
  queryConfig?: QueryConfig<typeof getDataScopesPaginatedQueryOptions>;
};

export const useGetDataScopesPaginated = (options: UseGetDataScopesPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDataScopesPaginatedQueryOptions(params),
    ...queryConfig,
  });
};