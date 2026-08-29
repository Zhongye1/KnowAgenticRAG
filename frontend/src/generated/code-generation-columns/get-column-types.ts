import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取代码生成模型列类型 */

export const getColumnTypes = (): Promise<string[]> => {
  return api.get(`/api/v1/code-generation/columns/types`).then((res) => res.data);
};

export const getColumnTypesQueryOptions = () => {
  return queryOptions({
    queryKey: ['code-generation-columns', 'get-column-types'],
    queryFn: () => getColumnTypes(),
  });
};

type UseGetColumnTypesOptions = {
  queryConfig?: QueryConfig<typeof getColumnTypesQueryOptions>;
};

export const useGetColumnTypes = ({ queryConfig }: UseGetColumnTypesOptions = {}) => {
  return useQuery({
    ...getColumnTypesQueryOptions(),
    ...queryConfig,
  });
};