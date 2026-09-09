import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DeleteRoleParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除角色 */

export const deleteRoles = (data: DeleteRoleParam): Promise<unknown> => {
  return api.delete(`/api/v1/sys/roles`, { data }).then((res) => res.data);
};

type UseDeleteRolesOptions = {
  mutationConfig?: MutationConfig<typeof deleteRoles>;
};

export const useDeleteRoles = ({ mutationConfig }: UseDeleteRolesOptions = {}) => {
  return useMutation({
    mutationFn: deleteRoles,
    ...mutationConfig,
  });
};