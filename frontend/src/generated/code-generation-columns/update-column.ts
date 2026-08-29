import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateGenColumnParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新代码生成模型列 */
export type UpdateColumnParams = {
  pk: string | number;
  data: UpdateGenColumnParam;
};

export const updateColumn = (params: UpdateColumnParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/code-generation/columns/${pk}`, data).then((res) => res.data);
};

type UseUpdateColumnOptions = {
  mutationConfig?: MutationConfig<typeof updateColumn>;
};

export const useUpdateColumn = ({ mutationConfig }: UseUpdateColumnOptions = {}) => {
  return useMutation({
    mutationFn: updateColumn,
    ...mutationConfig,
  });
};