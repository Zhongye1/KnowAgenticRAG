import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 健康检查 */

export const healthCheck = (): Promise<unknown> => {
  return api.get(`/api/v1/health`).then((res) => res.data);
};

export const healthCheckQueryOptions = () => {
  return queryOptions({
    queryKey: ['health', 'health-check'],
    queryFn: () => healthCheck(),
  });
};

type UseHealthCheckOptions = {
  queryConfig?: QueryConfig<typeof healthCheckQueryOptions>;
};

export const useHealthCheck = ({ queryConfig }: UseHealthCheckOptions = {}) => {
  return useQuery({
    ...healthCheckQueryOptions(),
    ...queryConfig,
  });
};