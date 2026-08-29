import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { AuthLoginParam, GetLoginToken } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 用户登录 */

export const login = (data: AuthLoginParam): Promise<GetLoginToken> => {
  return api.post(`/api/v1/auth/login`, data).then((res) => res.data);
};

type UseLoginOptions = {
  mutationConfig?: MutationConfig<typeof login>;
};

export const useLogin = ({ mutationConfig }: UseLoginOptions = {}) => {
  return useMutation({
    mutationFn: login,
    ...mutationConfig,
  });
};