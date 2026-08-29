import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetTokenDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取在线用户 */
export type GetSessionsParams = {
  username?: string | null;
};

export const getSessions = (params: GetSessionsParams): Promise<GetTokenDetail[]> => {
  const { username } = params;
  return api.get(`/api/v1/monitors/sessions`, { params: { username } }).then((res) => res.data);
};

export const getSessionsQueryOptions = (params: GetSessionsParams) => {
  return queryOptions({
    queryKey: ['monitors-sessions', 'get-sessions', params],
    queryFn: () => getSessions(params),
  });
};

type UseGetSessionsOptions = {
  params: GetSessionsParams;
  queryConfig?: QueryConfig<typeof getSessionsQueryOptions>;
};

export const useGetSessions = (options: UseGetSessionsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getSessionsQueryOptions(params),
    ...queryConfig,
  });
};