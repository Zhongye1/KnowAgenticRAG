import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取数据规则可用模型 */

export const getDataRuleModels = (): Promise<string[]> => {
  return api.get(`/api/v1/sys/data-rules/models`).then((res) => res.data);
};

export const getDataRuleModelsQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-data-rules', 'get-data-rule-models'],
    queryFn: () => getDataRuleModels(),
  });
};

type UseGetDataRuleModelsOptions = {
  queryConfig?: QueryConfig<typeof getDataRuleModelsQueryOptions>;
};

export const useGetDataRuleModels = ({ queryConfig }: UseGetDataRuleModelsOptions = {}) => {
  return useQuery({
    ...getDataRuleModelsQueryOptions(),
    ...queryConfig,
  });
};