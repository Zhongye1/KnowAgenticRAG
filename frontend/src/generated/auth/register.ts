import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { GetUserInfoWithRelationDetail, RegisterUserParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 用户注册 */

export const register = (data: RegisterUserParam): Promise<GetUserInfoWithRelationDetail> => {
  return api.post(`/api/v1/auth/register`, data).then((res) => res.data);
};

type UseRegisterOptions = {
  mutationConfig?: MutationConfig<typeof register>;
};

export const useRegister = ({ mutationConfig }: UseRegisterOptions = {}) => {
  return useMutation({
    mutationFn: register,
    ...mutationConfig,
  });
};