import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetGenColumnDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取代码生成模型列详情 */
export type GetColumnParams = {
  pk: string | number;
};

export const getColumn = (params: GetColumnParams): Promise<GetGenColumnDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/code-generation/columns/${pk}`).then((res) => res.data);
};

export const getColumnQueryOptions = (params: GetColumnParams) => {
  return queryOptions({
    queryKey: ['code-generation-columns', 'get-column', params],
    queryFn: () => getColumn(params),
  });
};

type UseGetColumnOptions = {
  params: GetColumnParams;
  queryConfig?: QueryConfig<typeof getColumnQueryOptions>;
};

export const useGetColumn = (options: UseGetColumnOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getColumnQueryOptions(params),
    ...queryConfig,
  });
};