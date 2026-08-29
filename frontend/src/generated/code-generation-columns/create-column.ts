import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateGenColumnParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建代码生成模型列 */

export const createColumn = (data: CreateGenColumnParam): Promise<unknown> => {
  return api.post(`/api/v1/code-generation/columns`, data).then((res) => res.data);
};

type UseCreateColumnOptions = {
  mutationConfig?: MutationConfig<typeof createColumn>;
};

export const useCreateColumn = ({ mutationConfig }: UseCreateColumnOptions = {}) => {
  return useMutation({
    mutationFn: createColumn,
    ...mutationConfig,
  });
};