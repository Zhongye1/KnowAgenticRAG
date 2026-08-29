import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 下载插件 */
export type DownloadPluginParams = {
  plugin: string | number;
};

export const downloadPlugin = (params: DownloadPluginParams): Promise<unknown> => {
  const { plugin } = params;
  return api.get(`/api/v1/sys/plugins/${plugin}`).then((res) => res.data);
};

export const downloadPluginQueryOptions = (params: DownloadPluginParams) => {
  return queryOptions({
    queryKey: ['sys-plugins', 'download-plugin', params],
    queryFn: () => downloadPlugin(params),
  });
};

type UseDownloadPluginOptions = {
  params: DownloadPluginParams;
  queryConfig?: QueryConfig<typeof downloadPluginQueryOptions>;
};

export const useDownloadPlugin = (options: UseDownloadPluginOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...downloadPluginQueryOptions(params),
    ...queryConfig,
  });
};