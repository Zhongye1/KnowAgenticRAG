import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UserPermissionType } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新用户权限 */
export type UpdateUserPermissionParams = {
  pk: string | number;
  type: UserPermissionType;
};

export const updateUserPermission = (params: UpdateUserPermissionParams): Promise<unknown> => {
  const { pk, type } = params;
  return api.put(`/api/v1/sys/users/${pk}/permissions`, null, { params: { type } }).then((res) => res.data);
};

type UseUpdateUserPermissionOptions = {
  mutationConfig?: MutationConfig<typeof updateUserPermission>;
};

export const useUpdateUserPermission = ({ mutationConfig }: UseUpdateUserPermissionOptions = {}) => {
  return useMutation({
    mutationFn: updateUserPermission,
    ...mutationConfig,
  });
};