import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { GetNewToken } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 刷新 token */

export const refreshToken = (): Promise<GetNewToken> => {
  return api.post(`/api/v1/auth/refresh`).then((res) => res.data);
};

type UseRefreshTokenOptions = {
  mutationConfig?: MutationConfig<typeof refreshToken>;
};

export const useRefreshToken = ({ mutationConfig }: UseRefreshTokenOptions = {}) => {
  return useMutation({
    mutationFn: refreshToken,
    ...mutationConfig,
  });
};