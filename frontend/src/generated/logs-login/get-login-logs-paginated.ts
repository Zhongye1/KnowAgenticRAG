import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetLoginLogDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取登录日志 */
export type GetLoginLogsPaginatedParams = {
  username?: string | null;
  status?: number | null;
  ip?: string | null;
  page?: number;
  size?: number;
};

export const getLoginLogsPaginated = (params: GetLoginLogsPaginatedParams): Promise<PageData<GetLoginLogDetail>> => {
  const { username, status, ip, page, size } = params;
  return api.get(`/api/v1/logs/login`, { params: { username, status, ip, page, size } }).then((res) => res.data);
};

export const getLoginLogsPaginatedQueryOptions = (params: GetLoginLogsPaginatedParams) => {
  return queryOptions({
    queryKey: ['logs-login', 'get-login-logs-paginated', params],
    queryFn: () => getLoginLogsPaginated(params),
  });
};

type UseGetLoginLogsPaginatedOptions = {
  params: GetLoginLogsPaginatedParams;
  queryConfig?: QueryConfig<typeof getLoginLogsPaginatedQueryOptions>;
};

export const useGetLoginLogsPaginated = (options: UseGetLoginLogsPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getLoginLogsPaginatedQueryOptions(params),
    ...queryConfig,
  });
};