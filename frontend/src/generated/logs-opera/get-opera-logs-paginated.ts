import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetOperaLogDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取操作日志 */
export type GetOperaLogsPaginatedParams = {
  username?: string | null;
  status?: number | null;
  ip?: string | null;
  page?: number;
  size?: number;
};

export const getOperaLogsPaginated = (params: GetOperaLogsPaginatedParams): Promise<PageData<GetOperaLogDetail>> => {
  const { username, status, ip, page, size } = params;
  return api.get(`/api/v1/logs/opera`, { params: { username, status, ip, page, size } }).then((res) => res.data);
};

export const getOperaLogsPaginatedQueryOptions = (params: GetOperaLogsPaginatedParams) => {
  return queryOptions({
    queryKey: ['logs-opera', 'get-opera-logs-paginated', params],
    queryFn: () => getOperaLogsPaginated(params),
  });
};

type UseGetOperaLogsPaginatedOptions = {
  params: GetOperaLogsPaginatedParams;
  queryConfig?: QueryConfig<typeof getOperaLogsPaginatedQueryOptions>;
};

export const useGetOperaLogsPaginated = (options: UseGetOperaLogsPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getOperaLogsPaginatedQueryOptions(params),
    ...queryConfig,
  });
};