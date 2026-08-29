import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { ServerMonitorInfo } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** Server 监控 */

export const getServerInfo = (): Promise<ServerMonitorInfo> => {
  return api.get(`/api/v1/monitors/server`).then((res) => res.data);
};

export const getServerInfoQueryOptions = () => {
  return queryOptions({
    queryKey: ['monitors-server', 'get-server-info'],
    queryFn: () => getServerInfo(),
  });
};

type UseGetServerInfoOptions = {
  queryConfig?: QueryConfig<typeof getServerInfoQueryOptions>;
};

export const useGetServerInfo = ({ queryConfig }: UseGetServerInfoOptions = {}) => {
  return useQuery({
    ...getServerInfoQueryOptions(),
    ...queryConfig,
  });
};