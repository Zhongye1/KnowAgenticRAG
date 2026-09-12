import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { ModelProviderCreateParam, ModelProviderDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建模型供应商 */

export const createProvider = (data: ModelProviderCreateParam): Promise<ModelProviderDetail> => {
  return api.post(`/api/v1/system/model-providers`, data).then((res) => res.data);
};

type UseCreateProviderOptions = {
  mutationConfig?: MutationConfig<typeof createProvider>;
};

export const useCreateProvider = ({ mutationConfig }: UseCreateProviderOptions = {}) => {
  return useMutation({
    mutationFn: createProvider,
    ...mutationConfig,
  });
};