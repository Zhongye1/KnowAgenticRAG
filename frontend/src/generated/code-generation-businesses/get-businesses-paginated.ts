import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetGenBusinessDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有代码生成业务 */
export type GetBusinessesPaginatedParams = {
  table_name?: string | null;
  page?: number;
  size?: number;
};

export const getBusinessesPaginated = (params: GetBusinessesPaginatedParams): Promise<PageData<GetGenBusinessDetail>> => {
  const { table_name, page, size } = params;
  return api.get(`/api/v1/code-generation/businesses`, { params: { table_name, page, size } }).then((res) => res.data);
};

export const getBusinessesPaginatedQueryOptions = (params: GetBusinessesPaginatedParams) => {
  return queryOptions({
    queryKey: ['code-generation-businesses', 'get-businesses-paginated', params],
    queryFn: () => getBusinessesPaginated(params),
  });
};

type UseGetBusinessesPaginatedOptions = {
  params: GetBusinessesPaginatedParams;
  queryConfig?: QueryConfig<typeof getBusinessesPaginatedQueryOptions>;
};

export const useGetBusinessesPaginated = (options: UseGetBusinessesPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getBusinessesPaginatedQueryOptions(params),
    ...queryConfig,
  });
};