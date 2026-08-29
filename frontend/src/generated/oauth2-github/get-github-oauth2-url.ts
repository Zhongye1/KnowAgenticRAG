import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取 Github 授权链接 */

export const getGithubOauth2Url = (): Promise<string> => {
  return api.get(`/api/v1/oauth2/github`).then((res) => res.data);
};

export const getGithubOauth2UrlQueryOptions = () => {
  return queryOptions({
    queryKey: ['oauth2-github', 'get-github-oauth2-url'],
    queryFn: () => getGithubOauth2Url(),
  });
};

type UseGetGithubOauth2UrlOptions = {
  queryConfig?: QueryConfig<typeof getGithubOauth2UrlQueryOptions>;
};

export const useGetGithubOauth2Url = ({ queryConfig }: UseGetGithubOauth2UrlOptions = {}) => {
  return useQuery({
    ...getGithubOauth2UrlQueryOptions(),
    ...queryConfig,
  });
};