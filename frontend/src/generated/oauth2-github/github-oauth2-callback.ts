import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** Github 授权自动重定向 */
export type GithubOauth2CallbackParams = {
  code?: string | null;
  state?: string | null;
  code_verifier?: string | null;
  error?: string | null;
};

export const githubOauth2Callback = (params: GithubOauth2CallbackParams): Promise<unknown> => {
  const { code, state, code_verifier, error } = params;
  return api.get(`/api/v1/oauth2/github/callback`, { params: { code, state, code_verifier, error } }).then((res) => res.data);
};

export const githubOauth2CallbackQueryOptions = (params: GithubOauth2CallbackParams) => {
  return queryOptions({
    queryKey: ['oauth2-github', 'github-oauth2-callback', params],
    queryFn: () => githubOauth2Callback(params),
  });
};

type UseGithubOauth2CallbackOptions = {
  params: GithubOauth2CallbackParams;
  queryConfig?: QueryConfig<typeof githubOauth2CallbackQueryOptions>;
};

export const useGithubOauth2Callback = (options: UseGithubOauth2CallbackOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...githubOauth2CallbackQueryOptions(params),
    ...queryConfig,
  });
};