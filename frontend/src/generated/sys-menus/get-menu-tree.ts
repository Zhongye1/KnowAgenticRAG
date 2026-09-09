import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetMenuTree } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取菜单树 */
export type GetMenuTreeParams = {
  title?: string | null;
  status?: number | null;
};

export const getMenuTree = (params: GetMenuTreeParams): Promise<GetMenuTree[]> => {
  const { title, status } = params;
  return api.get(`/api/v1/sys/menus`, { params: { title, status } }).then((res) => res.data);
};

export const getMenuTreeQueryOptions = (params: GetMenuTreeParams) => {
  return queryOptions({
    queryKey: ['sys-menus', 'get-menu-tree', params],
    queryFn: () => getMenuTree(params),
  });
};

type UseGetMenuTreeOptions = {
  params: GetMenuTreeParams;
  queryConfig?: QueryConfig<typeof getMenuTreeQueryOptions>;
};

export const useGetMenuTree = (options: UseGetMenuTreeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getMenuTreeQueryOptions(params),
    ...queryConfig,
  });
};