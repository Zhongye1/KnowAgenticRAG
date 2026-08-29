import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateConfigParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建参数配置 */

export const createConfig = (data: CreateConfigParam): Promise<unknown> => {
  return api.post(`/api/v1/sys/configs`, data).then((res) => res.data);
};

type UseCreateConfigOptions = {
  mutationConfig?: MutationConfig<typeof createConfig>;
};

export const useCreateConfig = ({ mutationConfig }: UseCreateConfigOptions = {}) => {
  return useMutation({
    mutationFn: createConfig,
    ...mutationConfig,
  });
};