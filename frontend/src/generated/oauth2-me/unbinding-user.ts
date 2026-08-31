import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UserSocialType } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 解绑用户社交账号 */
export type UnbindingUserParams = {
  source: UserSocialType;
};

export const unbindingUser = (params: UnbindingUserParams): Promise<unknown> => {
  const { source } = params;
  return api.delete(`/api/v1/oauth2/me/unbinding`, { params: { source } }).then((res) => res.data);
};

type UseUnbindingUserOptions = {
  mutationConfig?: MutationConfig<typeof unbindingUser>;
};

export const useUnbindingUser = ({ mutationConfig }: UseUnbindingUserOptions = {}) => {
  return useMutation({
    mutationFn: unbindingUser,
    ...mutationConfig,
  });
};
