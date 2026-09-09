import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取 google 授权链接 */

export const getGoogleOauth2Url = (): Promise<string> => {
  return api.get(`/api/v1/oauth2/google`).then((res) => res.data);
};

export const getGoogleOauth2UrlQueryOptions = () => {
  return queryOptions({
    queryKey: ['oauth2-google', 'get-google-oauth2-url'],
    queryFn: () => getGoogleOauth2Url(),
  });
};

type UseGetGoogleOauth2UrlOptions = {
  queryConfig?: QueryConfig<typeof getGoogleOauth2UrlQueryOptions>;
};

export const useGetGoogleOauth2Url = ({ queryConfig }: UseGetGoogleOauth2UrlOptions = {}) => {
  return useQuery({
    ...getGoogleOauth2UrlQueryOptions(),
    ...queryConfig,
  });
};