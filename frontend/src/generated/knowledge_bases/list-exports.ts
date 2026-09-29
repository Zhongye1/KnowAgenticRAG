import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { ExportItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 导出历史 */
export type ListExportsParams = {
  kb_name: string | number;
  limit?: number;
};

export const listExports = (params: ListExportsParams): Promise<ExportItem[]> => {
  const { kb_name, limit } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/exports`, { params: { limit } }).then((res) => res.data);
};

export const listExportsQueryOptions = (params: ListExportsParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'list-exports', params],
    queryFn: () => listExports(params),
  });
};

type UseListExportsOptions = {
  params: ListExportsParams;
  queryConfig?: QueryConfig<typeof listExportsQueryOptions>;
};

export const useListExports = (options: UseListExportsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...listExportsQueryOptions(params),
    ...queryConfig,
  });
};