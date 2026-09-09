import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDictDataDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取所有字典数据 */

export const getAllDictDatas = (): Promise<GetDictDataDetail[]> => {
  return api.get(`/api/v1/sys/dict-datas/all`).then((res) => res.data);
};

export const getAllDictDatasQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-dict-datas', 'get-all-dict-datas'],
    queryFn: () => getAllDictDatas(),
  });
};

type UseGetAllDictDatasOptions = {
  queryConfig?: QueryConfig<typeof getAllDictDatasQueryOptions>;
};

export const useGetAllDictDatas = ({ queryConfig }: UseGetAllDictDatasOptions = {}) => {
  return useQuery({
    ...getAllDictDatasQueryOptions(),
    ...queryConfig,
  });
};