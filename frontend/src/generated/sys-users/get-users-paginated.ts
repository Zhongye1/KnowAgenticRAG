import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetUserInfoWithRelationDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有用户 */
export type GetUsersPaginatedParams = {
  dept?: number | null;
  username?: string | null;
  phone?: string | null;
  status?: number | null;
  page?: number;
  size?: number;
};

export const getUsersPaginated = (params: GetUsersPaginatedParams): Promise<PageData<GetUserInfoWithRelationDetail>> => {
  const { dept, username, phone, status, page, size } = params;
  return api.get(`/api/v1/sys/users`, { params: { dept, username, phone, status, page, size } }).then((res) => res.data);
};

export const getUsersPaginatedQueryOptions = (params: GetUsersPaginatedParams) => {
  return queryOptions({
    queryKey: ['sys-users', 'get-users-paginated', params],
    queryFn: () => getUsersPaginated(params),
  });
};

type UseGetUsersPaginatedOptions = {
  params: GetUsersPaginatedParams;
  queryConfig?: QueryConfig<typeof getUsersPaginatedQueryOptions>;
};

export const useGetUsersPaginated = (options: UseGetUsersPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getUsersPaginatedQueryOptions(params),
    ...queryConfig,
  });
};