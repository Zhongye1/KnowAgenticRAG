import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新插件状态 */
export type UpdatePluginStatusParams = {
  plugin: string | number;
};

export const updatePluginStatus = (params: UpdatePluginStatusParams): Promise<unknown> => {
  const { plugin } = params;
  return api.put(`/api/v1/sys/plugins/${plugin}/status`).then((res) => res.data);
};

type UseUpdatePluginStatusOptions = {
  mutationConfig?: MutationConfig<typeof updatePluginStatus>;
};

export const useUpdatePluginStatus = ({ mutationConfig }: UseUpdatePluginStatusOptions = {}) => {
  return useMutation({
    mutationFn: updatePluginStatus,
    ...mutationConfig,
  });
};