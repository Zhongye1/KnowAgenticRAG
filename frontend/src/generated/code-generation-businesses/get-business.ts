import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetGenBusinessDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取代码生成业务详情 */
export type GetBusinessParams = {
  pk: string | number;
};

export const getBusiness = (params: GetBusinessParams): Promise<GetGenBusinessDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/code-generation/businesses/${pk}`).then((res) => res.data);
};

export const getBusinessQueryOptions = (params: GetBusinessParams) => {
  return queryOptions({
    queryKey: ['code-generation-businesses', 'get-business', params],
    queryFn: () => getBusiness(params),
  });
};

type UseGetBusinessOptions = {
  params: GetBusinessParams;
  queryConfig?: QueryConfig<typeof getBusinessQueryOptions>;
};

export const useGetBusiness = (options: UseGetBusinessOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getBusinessQueryOptions(params),
    ...queryConfig,
  });
};