import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取角色菜单树 */
export type GetRoleMenuTreeParams = {
  pk: string | number;
};

export const getRoleMenuTree = (params: GetRoleMenuTreeParams): Promise<unknown> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/roles/${pk}/menus`).then((res) => res.data);
};

export const getRoleMenuTreeQueryOptions = (params: GetRoleMenuTreeParams) => {
  return queryOptions({
    queryKey: ['sys-roles', 'get-role-menu-tree', params],
    queryFn: () => getRoleMenuTree(params),
  });
};

type UseGetRoleMenuTreeOptions = {
  params: GetRoleMenuTreeParams;
  queryConfig?: QueryConfig<typeof getRoleMenuTreeQueryOptions>;
};

export const useGetRoleMenuTree = (options: UseGetRoleMenuTreeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getRoleMenuTreeQueryOptions(params),
    ...queryConfig,
  });
};