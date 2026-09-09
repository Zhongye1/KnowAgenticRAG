import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDataRuleDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取所有数据规则 */

export const getAllDataRules = (): Promise<GetDataRuleDetail[]> => {
  return api.get(`/api/v1/sys/data-rules/all`).then((res) => res.data);
};

export const getAllDataRulesQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-data-rules', 'get-all-data-rules'],
    queryFn: () => getAllDataRules(),
  });
};

type UseGetAllDataRulesOptions = {
  queryConfig?: QueryConfig<typeof getAllDataRulesQueryOptions>;
};

export const useGetAllDataRules = ({ queryConfig }: UseGetAllDataRulesOptions = {}) => {
  return useQuery({
    ...getAllDataRulesQueryOptions(),
    ...queryConfig,
  });
};