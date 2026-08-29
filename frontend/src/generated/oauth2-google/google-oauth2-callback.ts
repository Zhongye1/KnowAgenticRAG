import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** google 授权自动重定向 */
export type GoogleOauth2CallbackParams = {
  code?: string | null;
  state?: string | null;
  code_verifier?: string | null;
  error?: string | null;
};

export const googleOauth2Callback = (params: GoogleOauth2CallbackParams): Promise<unknown> => {
  const { code, state, code_verifier, error } = params;
  return api.get(`/api/v1/oauth2/google/callback`, { params: { code, state, code_verifier, error } }).then((res) => res.data);
};

export const googleOauth2CallbackQueryOptions = (params: GoogleOauth2CallbackParams) => {
  return queryOptions({
    queryKey: ['oauth2-google', 'google-oauth2-callback', params],
    queryFn: () => googleOauth2Callback(params),
  });
};

type UseGoogleOauth2CallbackOptions = {
  params: GoogleOauth2CallbackParams;
  queryConfig?: QueryConfig<typeof googleOauth2CallbackQueryOptions>;
};

export const useGoogleOauth2Callback = (options: UseGoogleOauth2CallbackOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...googleOauth2CallbackQueryOptions(params),
    ...queryConfig,
  });
};