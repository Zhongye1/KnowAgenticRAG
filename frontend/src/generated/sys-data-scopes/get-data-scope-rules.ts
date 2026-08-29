import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDataScopeWithRelationDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取数据范围所有规则 */
export type GetDataScopeRulesParams = {
  pk: string | number;
};

export const getDataScopeRules = (params: GetDataScopeRulesParams): Promise<GetDataScopeWithRelationDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/data-scopes/${pk}/rules`).then((res) => res.data);
};

export const getDataScopeRulesQueryOptions = (params: GetDataScopeRulesParams) => {
  return queryOptions({
    queryKey: ['sys-data-scopes', 'get-data-scope-rules', params],
    queryFn: () => getDataScopeRules(params),
  });
};

type UseGetDataScopeRulesOptions = {
  params: GetDataScopeRulesParams;
  queryConfig?: QueryConfig<typeof getDataScopeRulesQueryOptions>;
};

export const useGetDataScopeRules = (options: UseGetDataScopeRulesOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDataScopeRulesQueryOptions(params),
    ...queryConfig,
  });
};