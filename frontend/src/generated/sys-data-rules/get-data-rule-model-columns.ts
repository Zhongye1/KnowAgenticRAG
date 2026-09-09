import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDataRuleColumnDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取数据规则可用模型列 */
export type GetDataRuleModelColumnsParams = {
  model: string | number;
};

export const getDataRuleModelColumns = (params: GetDataRuleModelColumnsParams): Promise<GetDataRuleColumnDetail[]> => {
  const { model } = params;
  return api.get(`/api/v1/sys/data-rules/models/${model}/columns`).then((res) => res.data);
};

export const getDataRuleModelColumnsQueryOptions = (params: GetDataRuleModelColumnsParams) => {
  return queryOptions({
    queryKey: ['sys-data-rules', 'get-data-rule-model-columns', params],
    queryFn: () => getDataRuleModelColumns(params),
  });
};

type UseGetDataRuleModelColumnsOptions = {
  params: GetDataRuleModelColumnsParams;
  queryConfig?: QueryConfig<typeof getDataRuleModelColumnsQueryOptions>;
};

export const useGetDataRuleModelColumns = (options: UseGetDataRuleModelColumnsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDataRuleModelColumnsQueryOptions(params),
    ...queryConfig,
  });
};