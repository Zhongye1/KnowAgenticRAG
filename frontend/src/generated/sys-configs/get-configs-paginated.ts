import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetConfigDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有参数配置 */
export type GetConfigsPaginatedParams = {
  name?: string | null;
  type?: string | null;
  page?: number;
  size?: number;
};

export const getConfigsPaginated = (params: GetConfigsPaginatedParams): Promise<PageData<GetConfigDetail>> => {
  const { name, type, page, size } = params;
  return api.get(`/api/v1/sys/configs`, { params: { name, type, page, size } }).then((res) => res.data);
};

export const getConfigsPaginatedQueryOptions = (params: GetConfigsPaginatedParams) => {
  return queryOptions({
    queryKey: ['sys-configs', 'get-configs-paginated', params],
    queryFn: () => getConfigsPaginated(params),
  });
};

type UseGetConfigsPaginatedOptions = {
  params: GetConfigsPaginatedParams;
  queryConfig?: QueryConfig<typeof getConfigsPaginatedQueryOptions>;
};

export const useGetConfigsPaginated = (options: UseGetConfigsPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getConfigsPaginatedQueryOptions(params),
    ...queryConfig,
  });
};