import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateDataRuleParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新数据规则 */
export type UpdateDataRuleParams = {
  pk: string | number;
  data: UpdateDataRuleParam;
};

export const updateDataRule = (params: UpdateDataRuleParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/data-rules/${pk}`, data).then((res) => res.data);
};

type UseUpdateDataRuleOptions = {
  mutationConfig?: MutationConfig<typeof updateDataRule>;
};

export const useUpdateDataRule = ({ mutationConfig }: UseUpdateDataRuleOptions = {}) => {
  return useMutation({
    mutationFn: updateDataRule,
    ...mutationConfig,
  });
};