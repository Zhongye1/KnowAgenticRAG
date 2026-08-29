import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 删除菜单 */
export type DeleteMenuParams = {
  pk: string | number;
};

export const deleteMenu = (params: DeleteMenuParams): Promise<unknown> => {
  const { pk } = params;
  return api.delete(`/api/v1/sys/menus/${pk}`).then((res) => res.data);
};

type UseDeleteMenuOptions = {
  mutationConfig?: MutationConfig<typeof deleteMenu>;
};

export const useDeleteMenu = ({ mutationConfig }: UseDeleteMenuOptions = {}) => {
  return useMutation({
    mutationFn: deleteMenu,
    ...mutationConfig,
  });
};