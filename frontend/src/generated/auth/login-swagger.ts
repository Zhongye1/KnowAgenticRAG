import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { GetSwaggerToken } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** swagger 调试专用 */
export type LoginSwaggerParams = {
  username: string;
  password: string;
};

export const loginSwagger = (params: LoginSwaggerParams): Promise<GetSwaggerToken> => {
  const { username, password } = params;
  return api.post(`/api/v1/auth/login/swagger`, null, { params: { username, password } }).then((res) => res.data);
};

type UseLoginSwaggerOptions = {
  mutationConfig?: MutationConfig<typeof loginSwagger>;
};

export const useLoginSwagger = ({ mutationConfig }: UseLoginSwaggerOptions = {}) => {
  return useMutation({
    mutationFn: loginSwagger,
    ...mutationConfig,
  });
};