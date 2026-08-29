import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetGenColumnDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取代码生成业务所有模型列 */
export type GetBusinessAllColumnsParams = {
  pk: string | number;
};

export const getBusinessAllColumns = (params: GetBusinessAllColumnsParams): Promise<GetGenColumnDetail[]> => {
  const { pk } = params;
  return api.get(`/api/v1/code-generation/businesses/${pk}/columns`).then((res) => res.data);
};

export const getBusinessAllColumnsQueryOptions = (params: GetBusinessAllColumnsParams) => {
  return queryOptions({
    queryKey: ['code-generation-businesses', 'get-business-all-columns', params],
    queryFn: () => getBusinessAllColumns(params),
  });
};

type UseGetBusinessAllColumnsOptions = {
  params: GetBusinessAllColumnsParams;
  queryConfig?: QueryConfig<typeof getBusinessAllColumnsQueryOptions>;
};

export const useGetBusinessAllColumns = (options: UseGetBusinessAllColumnsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getBusinessAllColumnsQueryOptions(params),
    ...queryConfig,
  });
};