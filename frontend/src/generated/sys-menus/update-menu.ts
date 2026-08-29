import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateMenuParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新菜单 */
export type UpdateMenuParams = {
  pk: string | number;
  data: UpdateMenuParam;
};

export const updateMenu = (params: UpdateMenuParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/menus/${pk}`, data).then((res) => res.data);
};

type UseUpdateMenuOptions = {
  mutationConfig?: MutationConfig<typeof updateMenu>;
};

export const useUpdateMenu = ({ mutationConfig }: UseUpdateMenuOptions = {}) => {
  return useMutation({
    mutationFn: updateMenu,
    ...mutationConfig,
  });
};