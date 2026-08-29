import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 是否存在插件变更 */

export const pluginChanged = (): Promise<boolean> => {
  return api.get(`/api/v1/sys/plugins/changed`).then((res) => res.data);
};

export const pluginChangedQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-plugins', 'plugin-changed'],
    queryFn: () => pluginChanged(),
  });
};

type UsePluginChangedOptions = {
  queryConfig?: QueryConfig<typeof pluginChangedQueryOptions>;
};

export const usePluginChanged = ({ queryConfig }: UsePluginChangedOptions = {}) => {
  return useQuery({
    ...pluginChangedQueryOptions(),
    ...queryConfig,
  });
};