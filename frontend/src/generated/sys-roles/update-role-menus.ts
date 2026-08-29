import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateRoleMenuParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新角色菜单 */
export type UpdateRoleMenusParams = {
  pk: string | number;
  data: UpdateRoleMenuParam;
};

export const updateRoleMenus = (params: UpdateRoleMenusParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/roles/${pk}/menus`, data).then((res) => res.data);
};

type UseUpdateRoleMenusOptions = {
  mutationConfig?: MutationConfig<typeof updateRoleMenus>;
};

export const useUpdateRoleMenus = ({ mutationConfig }: UseUpdateRoleMenusOptions = {}) => {
  return useMutation({
    mutationFn: updateRoleMenus,
    ...mutationConfig,
  });
};