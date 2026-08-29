import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取所有插件 */

export const getAllPlugins = (): Promise<Record<string, unknown>[]> => {
  return api.get(`/api/v1/sys/plugins`).then((res) => res.data);
};

export const getAllPluginsQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-plugins', 'get-all-plugins'],
    queryFn: () => getAllPlugins(),
  });
};

type UseGetAllPluginsOptions = {
  queryConfig?: QueryConfig<typeof getAllPluginsQueryOptions>;
};

export const useGetAllPlugins = ({ queryConfig }: UseGetAllPluginsOptions = {}) => {
  return useQuery({
    ...getAllPluginsQueryOptions(),
    ...queryConfig,
  });
};