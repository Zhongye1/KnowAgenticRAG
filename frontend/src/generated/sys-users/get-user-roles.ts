import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetRoleDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取用户所有角色 */
export type GetUserRolesParams = {
  pk: string | number;
};

export const getUserRoles = (params: GetUserRolesParams): Promise<GetRoleDetail[]> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/users/${pk}/roles`).then((res) => res.data);
};

export const getUserRolesQueryOptions = (params: GetUserRolesParams) => {
  return queryOptions({
    queryKey: ['sys-users', 'get-user-roles', params],
    queryFn: () => getUserRoles(params),
  });
};

type UseGetUserRolesOptions = {
  params: GetUserRolesParams;
  queryConfig?: QueryConfig<typeof getUserRolesQueryOptions>;
};

export const useGetUserRoles = (options: UseGetUserRolesOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getUserRolesQueryOptions(params),
    ...queryConfig,
  });
};