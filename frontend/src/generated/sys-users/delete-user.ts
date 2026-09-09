import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 删除用户 */
export type DeleteUserParams = {
  pk: string | number;
};

export const deleteUser = (params: DeleteUserParams): Promise<unknown> => {
  const { pk } = params;
  return api.delete(`/api/v1/sys/users/${pk}`).then((res) => res.data);
};

type UseDeleteUserOptions = {
  mutationConfig?: MutationConfig<typeof deleteUser>;
};

export const useDeleteUser = ({ mutationConfig }: UseDeleteUserOptions = {}) => {
  return useMutation({
    mutationFn: deleteUser,
    ...mutationConfig,
  });
};