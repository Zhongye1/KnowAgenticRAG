import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 重置用户密码 */
export type ResetUserPasswordParams = {
  pk: string | number;
  data: unknown;
};

export const resetUserPassword = (params: ResetUserPasswordParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/users/${pk}/password`, data).then((res) => res.data);
};

type UseResetUserPasswordOptions = {
  mutationConfig?: MutationConfig<typeof resetUserPassword>;
};

export const useResetUserPassword = ({ mutationConfig }: UseResetUserPasswordOptions = {}) => {
  return useMutation({
    mutationFn: resetUserPassword,
    ...mutationConfig,
  });
};