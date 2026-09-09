import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetRoleDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有角色 */
export type GetRolesPaginatedParams = {
  name?: string | null;
  status?: number | null;
  page?: number;
  size?: number;
};

export const getRolesPaginated = (params: GetRolesPaginatedParams): Promise<PageData<GetRoleDetail>> => {
  const { name, status, page, size } = params;
  return api.get(`/api/v1/sys/roles`, { params: { name, status, page, size } }).then((res) => res.data);
};

export const getRolesPaginatedQueryOptions = (params: GetRolesPaginatedParams) => {
  return queryOptions({
    queryKey: ['sys-roles', 'get-roles-paginated', params],
    queryFn: () => getRolesPaginated(params),
  });
};

type UseGetRolesPaginatedOptions = {
  params: GetRolesPaginatedParams;
  queryConfig?: QueryConfig<typeof getRolesPaginatedQueryOptions>;
};

export const useGetRolesPaginated = (options: UseGetRolesPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getRolesPaginatedQueryOptions(params),
    ...queryConfig,
  });
};