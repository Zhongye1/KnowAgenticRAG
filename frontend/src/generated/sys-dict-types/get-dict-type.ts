import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDictTypeDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取字典类型详情 */
export type GetDictTypeParams = {
  pk: string | number;
};

export const getDictType = (params: GetDictTypeParams): Promise<GetDictTypeDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/dict-types/${pk}`).then((res) => res.data);
};

export const getDictTypeQueryOptions = (params: GetDictTypeParams) => {
  return queryOptions({
    queryKey: ['sys-dict-types', 'get-dict-type', params],
    queryFn: () => getDictType(params),
  });
};

type UseGetDictTypeOptions = {
  params: GetDictTypeParams;
  queryConfig?: QueryConfig<typeof getDictTypeQueryOptions>;
};

export const useGetDictType = (options: UseGetDictTypeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDictTypeQueryOptions(params),
    ...queryConfig,
  });
};