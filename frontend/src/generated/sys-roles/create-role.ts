import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateRoleParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建角色 */

export const createRole = (data: CreateRoleParam): Promise<unknown> => {
  return api.post(`/api/v1/sys/roles`, data).then((res) => res.data);
};

type UseCreateRoleOptions = {
  mutationConfig?: MutationConfig<typeof createRole>;
};

export const useCreateRole = ({ mutationConfig }: UseCreateRoleOptions = {}) => {
  return useMutation({
    mutationFn: createRole,
    ...mutationConfig,
  });
};