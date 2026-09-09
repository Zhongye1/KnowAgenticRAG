import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDictDataDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取字典数据列表 */
export type GetDictDataByTypeCodeParams = {
  code: string | number;
};

export const getDictDataByTypeCode = (params: GetDictDataByTypeCodeParams): Promise<GetDictDataDetail[]> => {
  const { code } = params;
  return api.get(`/api/v1/sys/dict-datas/type-codes/${code}`).then((res) => res.data);
};

export const getDictDataByTypeCodeQueryOptions = (params: GetDictDataByTypeCodeParams) => {
  return queryOptions({
    queryKey: ['sys-dict-datas', 'get-dict-data-by-type-code', params],
    queryFn: () => getDictDataByTypeCode(params),
  });
};

type UseGetDictDataByTypeCodeOptions = {
  params: GetDictDataByTypeCodeParams;
  queryConfig?: QueryConfig<typeof getDictDataByTypeCodeQueryOptions>;
};

export const useGetDictDataByTypeCode = (options: UseGetDictDataByTypeCodeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDictDataByTypeCodeQueryOptions(params),
    ...queryConfig,
  });
};