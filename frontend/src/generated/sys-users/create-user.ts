import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { AddUserParam, GetUserInfoWithRelationDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建用户 */

export const createUser = (data: AddUserParam): Promise<GetUserInfoWithRelationDetail> => {
  return api.post(`/api/v1/sys/users`, data).then((res) => res.data);
};

type UseCreateUserOptions = {
  mutationConfig?: MutationConfig<typeof createUser>;
};

export const useCreateUser = ({ mutationConfig }: UseCreateUserOptions = {}) => {
  return useMutation({
    mutationFn: createUser,
    ...mutationConfig,
  });
};