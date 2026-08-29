import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateConfigParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新参数配置 */
export type UpdateConfigParams = {
  pk: string | number;
  data: UpdateConfigParam;
};

export const updateConfig = (params: UpdateConfigParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/configs/${pk}`, data).then((res) => res.data);
};

type UseUpdateConfigOptions = {
  mutationConfig?: MutationConfig<typeof updateConfig>;
};

export const useUpdateConfig = ({ mutationConfig }: UseUpdateConfigOptions = {}) => {
  return useMutation({
    mutationFn: updateConfig,
    ...mutationConfig,
  });
};