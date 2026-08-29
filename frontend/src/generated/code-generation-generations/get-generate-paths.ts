import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取代码生成路径 */
export type GetGeneratePathsParams = {
  pk: string | number;
};

export const getGeneratePaths = (params: GetGeneratePathsParams): Promise<string[]> => {
  const { pk } = params;
  return api.get(`/api/v1/code-generation/generations/${pk}/paths`).then((res) => res.data);
};

export const getGeneratePathsQueryOptions = (params: GetGeneratePathsParams) => {
  return queryOptions({
    queryKey: ['code-generation-generations', 'get-generate-paths', params],
    queryFn: () => getGeneratePaths(params),
  });
};

type UseGetGeneratePathsOptions = {
  params: GetGeneratePathsParams;
  queryConfig?: QueryConfig<typeof getGeneratePathsQueryOptions>;
};

export const useGetGeneratePaths = (options: UseGetGeneratePathsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getGeneratePathsQueryOptions(params),
    ...queryConfig,
  });
};