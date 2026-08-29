import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDataScopeDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取所有数据范围 */

export const getAllDataScope = (): Promise<GetDataScopeDetail[]> => {
  return api.get(`/api/v1/sys/data-scopes/all`).then((res) => res.data);
};

export const getAllDataScopeQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-data-scopes', 'get-all-data-scope'],
    queryFn: () => getAllDataScope(),
  });
};

type UseGetAllDataScopeOptions = {
  queryConfig?: QueryConfig<typeof getAllDataScopeQueryOptions>;
};

export const useGetAllDataScope = ({ queryConfig }: UseGetAllDataScopeOptions = {}) => {
  return useQuery({
    ...getAllDataScopeQueryOptions(),
    ...queryConfig,
  });
};