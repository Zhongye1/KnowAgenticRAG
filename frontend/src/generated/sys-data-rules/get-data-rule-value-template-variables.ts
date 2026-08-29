import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDataRuleTemplateVariableDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取数据规则值可用模板变量 */

export const getDataRuleValueTemplateVariables = (): Promise<GetDataRuleTemplateVariableDetail[]> => {
  return api.get(`/api/v1/sys/data-rules/value-template-variables`).then((res) => res.data);
};

export const getDataRuleValueTemplateVariablesQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-data-rules', 'get-data-rule-value-template-variables'],
    queryFn: () => getDataRuleValueTemplateVariables(),
  });
};

type UseGetDataRuleValueTemplateVariablesOptions = {
  queryConfig?: QueryConfig<typeof getDataRuleValueTemplateVariablesQueryOptions>;
};

export const useGetDataRuleValueTemplateVariables = ({ queryConfig }: UseGetDataRuleValueTemplateVariablesOptions = {}) => {
  return useQuery({
    ...getDataRuleValueTemplateVariablesQueryOptions(),
    ...queryConfig,
  });
};