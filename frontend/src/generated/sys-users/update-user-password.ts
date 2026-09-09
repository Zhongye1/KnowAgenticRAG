import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { ResetPasswordParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新当前用户密码 */

export const updateUserPassword = (data: ResetPasswordParam): Promise<unknown> => {
  return api.put(`/api/v1/sys/users/me/password`, data).then((res) => res.data);
};

type UseUpdateUserPasswordOptions = {
  mutationConfig?: MutationConfig<typeof updateUserPassword>;
};

export const useUpdateUserPassword = ({ mutationConfig }: UseUpdateUserPasswordOptions = {}) => {
  return useMutation({
    mutationFn: updateUserPassword,
    ...mutationConfig,
  });
};