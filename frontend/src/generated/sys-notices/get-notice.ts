import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetNoticeDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取通知公告详情 */
export type GetNoticeParams = {
  pk: string | number;
};

export const getNotice = (params: GetNoticeParams): Promise<GetNoticeDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/notices/${pk}`).then((res) => res.data);
};

export const getNoticeQueryOptions = (params: GetNoticeParams) => {
  return queryOptions({
    queryKey: ['sys-notices', 'get-notice', params],
    queryFn: () => getNotice(params),
  });
};

type UseGetNoticeOptions = {
  params: GetNoticeParams;
  queryConfig?: QueryConfig<typeof getNoticeQueryOptions>;
};

export const useGetNotice = (options: UseGetNoticeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getNoticeQueryOptions(params),
    ...queryConfig,
  });
};