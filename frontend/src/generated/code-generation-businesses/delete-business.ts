import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 删除代码生成业务 */
export type DeleteBusinessParams = {
  pk: string | number;
};

export const deleteBusiness = (params: DeleteBusinessParams): Promise<unknown> => {
  const { pk } = params;
  return api.delete(`/api/v1/code-generation/businesses/${pk}`).then((res) => res.data);
};

type UseDeleteBusinessOptions = {
  mutationConfig?: MutationConfig<typeof deleteBusiness>;
};

export const useDeleteBusiness = ({ mutationConfig }: UseDeleteBusinessOptions = {}) => {
  return useMutation({
    mutationFn: deleteBusiness,
    ...mutationConfig,
  });
};