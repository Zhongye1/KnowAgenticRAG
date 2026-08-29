import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDictDataDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取字典数据详情 */
export type GetDictDataParams = {
  pk: string | number;
};

export const getDictData = (params: GetDictDataParams): Promise<GetDictDataDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/dict-datas/${pk}`).then((res) => res.data);
};

export const getDictDataQueryOptions = (params: GetDictDataParams) => {
  return queryOptions({
    queryKey: ['sys-dict-datas', 'get-dict-data', params],
    queryFn: () => getDictData(params),
  });
};

type UseGetDictDataOptions = {
  params: GetDictDataParams;
  queryConfig?: QueryConfig<typeof getDictDataQueryOptions>;
};

export const useGetDictData = (options: UseGetDictDataOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDictDataQueryOptions(params),
    ...queryConfig,
  });
};