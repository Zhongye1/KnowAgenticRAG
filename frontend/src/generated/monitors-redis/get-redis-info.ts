import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { RedisMonitorInfo } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** Redis 监控 */

export const getRedisInfo = (): Promise<RedisMonitorInfo> => {
  return api.get(`/api/v1/monitors/redis`).then((res) => res.data);
};

export const getRedisInfoQueryOptions = () => {
  return queryOptions({
    queryKey: ['monitors-redis', 'get-redis-info'],
    queryFn: () => getRedisInfo(),
  });
};

type UseGetRedisInfoOptions = {
  queryConfig?: QueryConfig<typeof getRedisInfoQueryOptions>;
};

export const useGetRedisInfo = ({ queryConfig }: UseGetRedisInfoOptions = {}) => {
  return useQuery({
    ...getRedisInfoQueryOptions(),
    ...queryConfig,
  });
};