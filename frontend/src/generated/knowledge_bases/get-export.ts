import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { ExportItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 导出状态（成功时带下载 URL） */
export type GetExportParams = {
  kb_name: string | number;
  export_id: string | number;
};

export const getExport = (params: GetExportParams): Promise<ExportItem> => {
  const { kb_name, export_id } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/exports/${export_id}`).then((res) => res.data);
};

export const getExportQueryOptions = (params: GetExportParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-export', params],
    queryFn: () => getExport(params),
  });
};

type UseGetExportOptions = {
  params: GetExportParams;
  queryConfig?: QueryConfig<typeof getExportQueryOptions>;
};

export const useGetExport = (options: UseGetExportOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getExportQueryOptions(params),
    ...queryConfig,
  });
};