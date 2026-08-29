import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetMenuDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取菜单详情 */
export type GetMenuParams = {
  pk: string | number;
};

export const getMenu = (params: GetMenuParams): Promise<GetMenuDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/menus/${pk}`).then((res) => res.data);
};

export const getMenuQueryOptions = (params: GetMenuParams) => {
  return queryOptions({
    queryKey: ['sys-menus', 'get-menu', params],
    queryFn: () => getMenu(params),
  });
};

type UseGetMenuOptions = {
  params: GetMenuParams;
  queryConfig?: QueryConfig<typeof getMenuQueryOptions>;
};

export const useGetMenu = (options: UseGetMenuOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getMenuQueryOptions(params),
    ...queryConfig,
  });
};