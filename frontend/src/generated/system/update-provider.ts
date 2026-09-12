import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { ModelProviderDetail, ModelProviderUpdateParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新模型供应商 */
export type UpdateProviderParams = {
  provider_id: string | number;
  data: ModelProviderUpdateParam;
};

export const updateProvider = (params: UpdateProviderParams): Promise<ModelProviderDetail> => {
  const { provider_id, data } = params;
  return api.patch(`/api/v1/system/model-providers/${provider_id}`, data).then((res) => res.data);
};

type UseUpdateProviderOptions = {
  mutationConfig?: MutationConfig<typeof updateProvider>;
};

export const useUpdateProvider = ({ mutationConfig }: UseUpdateProviderOptions = {}) => {
  return useMutation({
    mutationFn: updateProvider,
    ...mutationConfig,
  });
};