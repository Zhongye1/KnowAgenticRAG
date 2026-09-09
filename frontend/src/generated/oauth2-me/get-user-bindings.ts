import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取用户已绑定的社交账号 */

export const getUserBindings = (): Promise<string[]> => {
  return api.get(`/api/v1/oauth2/me/bindings`).then((res) => res.data);
};

export const getUserBindingsQueryOptions = () => {
  return queryOptions({
    queryKey: ['oauth2-me', 'get-user-bindings'],
    queryFn: () => getUserBindings(),
  });
};

type UseGetUserBindingsOptions = {
  queryConfig?: QueryConfig<typeof getUserBindingsQueryOptions>;
};

export const useGetUserBindings = ({ queryConfig }: UseGetUserBindingsOptions = {}) => {
  return useQuery({
    ...getUserBindingsQueryOptions(),
    ...queryConfig,
  });
};