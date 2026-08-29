import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetCurrentUserInfoWithRelationDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取当前用户信息 */

export const getCurrentUser = (): Promise<GetCurrentUserInfoWithRelationDetail> => {
  return api.get(`/api/v1/sys/users/me`).then((res) => res.data);
};

export const getCurrentUserQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-users', 'get-current-user'],
    queryFn: () => getCurrentUser(),
  });
};

type UseGetCurrentUserOptions = {
  queryConfig?: QueryConfig<typeof getCurrentUserQueryOptions>;
};

export const useGetCurrentUser = ({ queryConfig }: UseGetCurrentUserOptions = {}) => {
  return useQuery({
    ...getCurrentUserQueryOptions(),
    ...queryConfig,
  });
};