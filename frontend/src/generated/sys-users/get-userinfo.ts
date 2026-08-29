import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetUserInfoWithRelationDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取用户信息 */
export type GetUserinfoParams = {
  pk: string | number;
};

export const getUserinfo = (params: GetUserinfoParams): Promise<GetUserInfoWithRelationDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/users/${pk}`).then((res) => res.data);
};

export const getUserinfoQueryOptions = (params: GetUserinfoParams) => {
  return queryOptions({
    queryKey: ['sys-users', 'get-userinfo', params],
    queryFn: () => getUserinfo(params),
  });
};

type UseGetUserinfoOptions = {
  params: GetUserinfoParams;
  queryConfig?: QueryConfig<typeof getUserinfoQueryOptions>;
};

export const useGetUserinfo = (options: UseGetUserinfoOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getUserinfoQueryOptions(params),
    ...queryConfig,
  });
};