import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 下载代码 */
export type DownloadCodeParams = {
  pk: string | number;
};

export const downloadCode = (params: DownloadCodeParams): Promise<unknown> => {
  const { pk } = params;
  return api.get(`/api/v1/code-generation/generations/${pk}`).then((res) => res.data);
};

export const downloadCodeQueryOptions = (params: DownloadCodeParams) => {
  return queryOptions({
    queryKey: ['code-generation-generations', 'download-code', params],
    queryFn: () => downloadCode(params),
  });
};

type UseDownloadCodeOptions = {
  params: DownloadCodeParams;
  queryConfig?: QueryConfig<typeof downloadCodeQueryOptions>;
};

export const useDownloadCode = (options: UseDownloadCodeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...downloadCodeQueryOptions(params),
    ...queryConfig,
  });
};