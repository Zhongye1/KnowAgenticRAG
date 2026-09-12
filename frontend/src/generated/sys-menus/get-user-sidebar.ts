import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取用户菜单侧边栏 */

export const getUserSidebar = (): Promise<Record<string, unknown>[]> => {
  return api.get(`/api/v1/sys/menus/sidebar`).then((res) => res.data);
};

export const getUserSidebarQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-menus', 'get-user-sidebar'],
    queryFn: () => getUserSidebar(),
  });
};

type UseGetUserSidebarOptions = {
  queryConfig?: QueryConfig<typeof getUserSidebarQueryOptions>;
};

export const useGetUserSidebar = ({ queryConfig }: UseGetUserSidebarOptions = {}) => {
  return useQuery({
    ...getUserSidebarQueryOptions(),
    ...queryConfig,
  });
};