import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新当前用户邮箱 */
export type UpdateUserEmailParamsData = {
  captcha: string;
  email: string;
};

export const updateUserEmail = (data: UpdateUserEmailParamsData): Promise<unknown> => {
  return api.put(`/api/v1/sys/users/me/email`, data).then((res) => res.data);
};

type UseUpdateUserEmailOptions = {
  mutationConfig?: MutationConfig<typeof updateUserEmail>;
};

export const useUpdateUserEmail = ({ mutationConfig }: UseUpdateUserEmailOptions = {}) => {
  return useMutation({
    mutationFn: updateUserEmail,
    ...mutationConfig,
  });
};