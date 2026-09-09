import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateUserParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新用户信息 */
export type UpdateUserParams = {
  pk: string | number;
  data: UpdateUserParam;
};

export const updateUser = (params: UpdateUserParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/users/${pk}`, data).then((res) => res.data);
};

type UseUpdateUserOptions = {
  mutationConfig?: MutationConfig<typeof updateUser>;
};

export const useUpdateUser = ({ mutationConfig }: UseUpdateUserOptions = {}) => {
  return useMutation({
    mutationFn: updateUser,
    ...mutationConfig,
  });
};