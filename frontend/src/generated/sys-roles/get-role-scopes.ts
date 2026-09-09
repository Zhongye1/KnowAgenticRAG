import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取角色所有数据范围 */
export type GetRoleScopesParams = {
  pk: string | number;
};

export const getRoleScopes = (params: GetRoleScopesParams): Promise<number[]> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/roles/${pk}/scopes`).then((res) => res.data);
};

export const getRoleScopesQueryOptions = (params: GetRoleScopesParams) => {
  return queryOptions({
    queryKey: ['sys-roles', 'get-role-scopes', params],
    queryFn: () => getRoleScopes(params),
  });
};

type UseGetRoleScopesOptions = {
  params: GetRoleScopesParams;
  queryConfig?: QueryConfig<typeof getRoleScopesQueryOptions>;
};

export const useGetRoleScopes = (options: UseGetRoleScopesOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getRoleScopesQueryOptions(params),
    ...queryConfig,
  });
};