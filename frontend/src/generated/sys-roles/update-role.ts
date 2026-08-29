import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateRoleParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新角色 */
export type UpdateRoleParams = {
  pk: string | number;
  data: UpdateRoleParam;
};

export const updateRole = (params: UpdateRoleParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/roles/${pk}`, data).then((res) => res.data);
};

type UseUpdateRoleOptions = {
  mutationConfig?: MutationConfig<typeof updateRole>;
};

export const useUpdateRole = ({ mutationConfig }: UseUpdateRoleOptions = {}) => {
  return useMutation({
    mutationFn: updateRole,
    ...mutationConfig,
  });
};