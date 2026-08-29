import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { PluginType } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 安装插件 */
export type InstallPluginParams = {
  type: PluginType;
  repo_url?: string | null;
  file?: File | null | null;
};

export const installPlugin = (params: InstallPluginParams): Promise<unknown> => {
  const { file, type, repo_url } = params;
  const formData = new FormData();
  if (file) formData.append('file', file);
  return api.post(`/api/v1/sys/plugins`, formData, { params: { type, repo_url } }).then((res) => res.data);
};

type UseInstallPluginOptions = {
  mutationConfig?: MutationConfig<typeof installPlugin>;
};

export const useInstallPlugin = ({ mutationConfig }: UseInstallPluginOptions = {}) => {
  return useMutation({
    mutationFn: installPlugin,
    ...mutationConfig,
  });
};