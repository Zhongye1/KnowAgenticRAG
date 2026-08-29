import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetNoticeDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有通知公告 */
export type GetNoticesPaginatedParams = {
  title?: string | null;
  type?: number | null;
  status?: number | null;
  page?: number;
  size?: number;
};

export const getNoticesPaginated = (params: GetNoticesPaginatedParams): Promise<PageData<GetNoticeDetail>> => {
  const { title, type, status, page, size } = params;
  return api.get(`/api/v1/sys/notices`, { params: { title, type, status, page, size } }).then((res) => res.data);
};

export const getNoticesPaginatedQueryOptions = (params: GetNoticesPaginatedParams) => {
  return queryOptions({
    queryKey: ['sys-notices', 'get-notices-paginated', params],
    queryFn: () => getNoticesPaginated(params),
  });
};

type UseGetNoticesPaginatedOptions = {
  params: GetNoticesPaginatedParams;
  queryConfig?: QueryConfig<typeof getNoticesPaginatedQueryOptions>;
};

export const useGetNoticesPaginated = (options: UseGetNoticesPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getNoticesPaginatedQueryOptions(params),
    ...queryConfig,
  });
};