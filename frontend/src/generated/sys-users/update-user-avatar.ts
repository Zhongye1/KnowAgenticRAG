import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新当前用户头像 */
export type UpdateUserAvatarParamsData = {
  avatar: string;
};

export const updateUserAvatar = (data: UpdateUserAvatarParamsData): Promise<unknown> => {
  return api.put(`/api/v1/sys/users/me/avatar`, data).then((res) => res.data);
};

type UseUpdateUserAvatarOptions = {
  mutationConfig?: MutationConfig<typeof updateUserAvatar>;
};

export const useUpdateUserAvatar = ({ mutationConfig }: UseUpdateUserAvatarOptions = {}) => {
  return useMutation({
    mutationFn: updateUserAvatar,
    ...mutationConfig,
  });
};