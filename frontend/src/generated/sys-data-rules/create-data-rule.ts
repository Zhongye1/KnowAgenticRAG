import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateDataRuleParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建数据规则 */

export const createDataRule = (data: CreateDataRuleParam): Promise<unknown> => {
  return api.post(`/api/v1/sys/data-rules`, data).then((res) => res.data);
};

type UseCreateDataRuleOptions = {
  mutationConfig?: MutationConfig<typeof createDataRule>;
};

export const useCreateDataRule = ({ mutationConfig }: UseCreateDataRuleOptions = {}) => {
  return useMutation({
    mutationFn: createDataRule,
    ...mutationConfig,
  });
};