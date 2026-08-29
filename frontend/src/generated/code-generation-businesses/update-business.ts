import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateGenBusinessParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新代码生成业务 */
export type UpdateBusinessParams = {
  pk: string | number;
  data: UpdateGenBusinessParam;
};

export const updateBusiness = (params: UpdateBusinessParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/code-generation/businesses/${pk}`, data).then((res) => res.data);
};

type UseUpdateBusinessOptions = {
  mutationConfig?: MutationConfig<typeof updateBusiness>;
};

export const useUpdateBusiness = ({ mutationConfig }: UseUpdateBusinessOptions = {}) => {
  return useMutation({
    mutationFn: updateBusiness,
    ...mutationConfig,
  });
};