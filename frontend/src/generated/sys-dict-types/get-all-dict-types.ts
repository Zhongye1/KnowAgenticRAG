import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDictTypeDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取所有字典数据 */

export const getAllDictTypes = (): Promise<GetDictTypeDetail[]> => {
  return api.get(`/api/v1/sys/dict-types/all`).then((res) => res.data);
};

export const getAllDictTypesQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-dict-types', 'get-all-dict-types'],
    queryFn: () => getAllDictTypes(),
  });
};

type UseGetAllDictTypesOptions = {
  queryConfig?: QueryConfig<typeof getAllDictTypesQueryOptions>;
};

export const useGetAllDictTypes = ({ queryConfig }: UseGetAllDictTypesOptions = {}) => {
  return useQuery({
    ...getAllDictTypesQueryOptions(),
    ...queryConfig,
  });
};