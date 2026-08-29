import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新当前用户昵称 */
export type UpdateUserNicknameParamsData = {
  nickname: string;
};

export const updateUserNickname = (data: UpdateUserNicknameParamsData): Promise<unknown> => {
  return api.put(`/api/v1/sys/users/me/nickname`, data).then((res) => res.data);
};

type UseUpdateUserNicknameOptions = {
  mutationConfig?: MutationConfig<typeof updateUserNickname>;
};

export const useUpdateUserNickname = ({ mutationConfig }: UseUpdateUserNicknameOptions = {}) => {
  return useMutation({
    mutationFn: updateUserNickname,
    ...mutationConfig,
  });
};