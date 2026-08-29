import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 代码生成 */
export type GenerateCodeParams = {
  pk: string | number;
};

export const generateCode = (params: GenerateCodeParams): Promise<unknown> => {
  const { pk } = params;
  return api.post(`/api/v1/code-generation/generations/${pk}`).then((res) => res.data);
};

type UseGenerateCodeOptions = {
  mutationConfig?: MutationConfig<typeof generateCode>;
};

export const useGenerateCode = ({ mutationConfig }: UseGenerateCodeOptions = {}) => {
  return useMutation({
    mutationFn: generateCode,
    ...mutationConfig,
  });
};