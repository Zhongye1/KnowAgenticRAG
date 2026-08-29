import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateGenBusinessParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建代码生成业务 */

export const createBusiness = (data: CreateGenBusinessParam): Promise<unknown> => {
  return api.post(`/api/v1/code-generation/businesses`, data).then((res) => res.data);
};

type UseCreateBusinessOptions = {
  mutationConfig?: MutationConfig<typeof createBusiness>;
};

export const useCreateBusiness = ({ mutationConfig }: UseCreateBusinessOptions = {}) => {
  return useMutation({
    mutationFn: createBusiness,
    ...mutationConfig,
  });
};