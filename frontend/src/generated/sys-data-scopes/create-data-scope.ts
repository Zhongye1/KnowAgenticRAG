import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateDataScopeParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建数据范围 */

export const createDataScope = (data: CreateDataScopeParam): Promise<unknown> => {
  return api.post(`/api/v1/sys/data-scopes`, data).then((res) => res.data);
};

type UseCreateDataScopeOptions = {
  mutationConfig?: MutationConfig<typeof createDataScope>;
};

export const useCreateDataScope = ({ mutationConfig }: UseCreateDataScopeOptions = {}) => {
  return useMutation({
    mutationFn: createDataScope,
    ...mutationConfig,
  });
};