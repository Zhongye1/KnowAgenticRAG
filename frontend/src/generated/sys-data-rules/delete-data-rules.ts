import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DeleteDataRuleParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除数据规则 */

export const deleteDataRules = (data: DeleteDataRuleParam): Promise<unknown> => {
  return api.delete(`/api/v1/sys/data-rules`, data).then((res) => res.data);
};

type UseDeleteDataRulesOptions = {
  mutationConfig?: MutationConfig<typeof deleteDataRules>;
};

export const useDeleteDataRules = ({ mutationConfig }: UseDeleteDataRulesOptions = {}) => {
  return useMutation({
    mutationFn: deleteDataRules,
    ...mutationConfig,
  });
};