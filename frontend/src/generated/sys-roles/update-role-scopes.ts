import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateRoleScopeParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新角色数据范围 */
export type UpdateRoleScopesParams = {
  pk: string | number;
  data: UpdateRoleScopeParam;
};

export const updateRoleScopes = (params: UpdateRoleScopesParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/roles/${pk}/scopes`, data).then((res) => res.data);
};

type UseUpdateRoleScopesOptions = {
  mutationConfig?: MutationConfig<typeof updateRoleScopes>;
};

export const useUpdateRoleScopes = ({ mutationConfig }: UseUpdateRoleScopesOptions = {}) => {
  return useMutation({
    mutationFn: updateRoleScopes,
    ...mutationConfig,
  });
};