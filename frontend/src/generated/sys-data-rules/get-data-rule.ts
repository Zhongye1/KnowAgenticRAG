import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDataRuleDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取数据规则详情 */
export type GetDataRuleParams = {
  pk: string | number;
};

export const getDataRule = (params: GetDataRuleParams): Promise<GetDataRuleDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/data-rules/${pk}`).then((res) => res.data);
};

export const getDataRuleQueryOptions = (params: GetDataRuleParams) => {
  return queryOptions({
    queryKey: ['sys-data-rules', 'get-data-rule', params],
    queryFn: () => getDataRule(params),
  });
};

type UseGetDataRuleOptions = {
  params: GetDataRuleParams;
  queryConfig?: QueryConfig<typeof getDataRuleQueryOptions>;
};

export const useGetDataRule = (options: UseGetDataRuleOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDataRuleQueryOptions(params),
    ...queryConfig,
  });
};