import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDataRuleDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有数据规则 */
export type GetDataRulesPaginatedParams = {
  name?: string | null;
  page?: number;
  size?: number;
};

export const getDataRulesPaginated = (params: GetDataRulesPaginatedParams): Promise<PageData<GetDataRuleDetail>> => {
  const { name, page, size } = params;
  return api.get(`/api/v1/sys/data-rules`, { params: { name, page, size } }).then((res) => res.data);
};

export const getDataRulesPaginatedQueryOptions = (params: GetDataRulesPaginatedParams) => {
  return queryOptions({
    queryKey: ['sys-data-rules', 'get-data-rules-paginated', params],
    queryFn: () => getDataRulesPaginated(params),
  });
};

type UseGetDataRulesPaginatedOptions = {
  params: GetDataRulesPaginatedParams;
  queryConfig?: QueryConfig<typeof getDataRulesPaginatedQueryOptions>;
};

export const useGetDataRulesPaginated = (options: UseGetDataRulesPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDataRulesPaginatedQueryOptions(params),
    ...queryConfig,
  });
};