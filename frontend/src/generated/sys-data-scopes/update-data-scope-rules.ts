import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateDataScopeRuleParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新数据范围规则 */
export type UpdateDataScopeRulesParams = {
  pk: string | number;
  data: UpdateDataScopeRuleParam;
};

export const updateDataScopeRules = (params: UpdateDataScopeRulesParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/data-scopes/${pk}/rules`, data).then((res) => res.data);
};

type UseUpdateDataScopeRulesOptions = {
  mutationConfig?: MutationConfig<typeof updateDataScopeRules>;
};

export const useUpdateDataScopeRules = ({ mutationConfig }: UseUpdateDataScopeRulesOptions = {}) => {
  return useMutation({
    mutationFn: updateDataScopeRules,
    ...mutationConfig,
  });
};