import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 删除代码生成模型列 */
export type DeleteColumnParams = {
  pk: string | number;
};

export const deleteColumn = (params: DeleteColumnParams): Promise<unknown> => {
  const { pk } = params;
  return api.delete(`/api/v1/code-generation/columns/${pk}`).then((res) => res.data);
};

type UseDeleteColumnOptions = {
  mutationConfig?: MutationConfig<typeof deleteColumn>;
};

export const useDeleteColumn = ({ mutationConfig }: UseDeleteColumnOptions = {}) => {
  return useMutation({
    mutationFn: deleteColumn,
    ...mutationConfig,
  });
};