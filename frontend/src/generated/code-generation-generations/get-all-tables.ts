import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取数据库表 */
export type GetAllTablesParams = {
  table_schema?: string;
};

export const getAllTables = (params: GetAllTablesParams): Promise<Record<string, unknown>[]> => {
  const { table_schema } = params;
  return api.get(`/api/v1/code-generation/generations/tables`, { params: { table_schema } }).then((res) => res.data);
};

export const getAllTablesQueryOptions = (params: GetAllTablesParams) => {
  return queryOptions({
    queryKey: ['code-generation-generations', 'get-all-tables', params],
    queryFn: () => getAllTables(params),
  });
};

type UseGetAllTablesOptions = {
  params: GetAllTablesParams;
  queryConfig?: QueryConfig<typeof getAllTablesQueryOptions>;
};

export const useGetAllTables = (options: UseGetAllTablesOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getAllTablesQueryOptions(params),
    ...queryConfig,
  });
};