import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { UserSocialType } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取绑定授权链接 */
export type GetBindingAuthUrlParams = {
  source: UserSocialType;
};

export const getBindingAuthUrl = (params: GetBindingAuthUrlParams): Promise<string> => {
  const { source } = params;
  return api.get(`/api/v1/oauth2/me/binding`, { params: { source } }).then((res) => res.data);
};

export const getBindingAuthUrlQueryOptions = (params: GetBindingAuthUrlParams) => {
  return queryOptions({
    queryKey: ['oauth2-me', 'get-binding-auth-url', params],
    queryFn: () => getBindingAuthUrl(params),
  });
};

type UseGetBindingAuthUrlOptions = {
  params: GetBindingAuthUrlParams;
  queryConfig?: QueryConfig<typeof getBindingAuthUrlQueryOptions>;
};

export const useGetBindingAuthUrl = (options: UseGetBindingAuthUrlOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getBindingAuthUrlQueryOptions(params),
    ...queryConfig,
  });
};