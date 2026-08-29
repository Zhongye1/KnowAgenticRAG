import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 卸载插件 */
export type UninstallPluginParams = {
  plugin: string | number;
};

export const uninstallPlugin = (params: UninstallPluginParams): Promise<unknown> => {
  const { plugin } = params;
  return api.delete(`/api/v1/sys/plugins/${plugin}`).then((res) => res.data);
};

type UseUninstallPluginOptions = {
  mutationConfig?: MutationConfig<typeof uninstallPlugin>;
};

export const useUninstallPlugin = ({ mutationConfig }: UseUninstallPluginOptions = {}) => {
  return useMutation({
    mutationFn: uninstallPlugin,
    ...mutationConfig,
  });
};