import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 删除模型供应商 */
export type DeleteProviderParams = {
  provider_id: string | number;
};

export const deleteProvider = (params: DeleteProviderParams): Promise<null> => {
  const { provider_id } = params;
  return api.delete(`/api/v1/system/model-providers/${provider_id}`).then((res) => res.data);
};

type UseDeleteProviderOptions = {
  mutationConfig?: MutationConfig<typeof deleteProvider>;
};

export const useDeleteProvider = ({ mutationConfig }: UseDeleteProviderOptions = {}) => {
  return useMutation({
    mutationFn: deleteProvider,
    ...mutationConfig,
  });
};