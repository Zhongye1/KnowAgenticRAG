import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除参数配置 */
export type DeleteConfigsParamsData = {
};

export const deleteConfigs = (data: DeleteConfigsParamsData): Promise<unknown> => {
  return api.delete(`/api/v1/sys/configs`, { data }).then((res) => res.data);
};

type UseDeleteConfigsOptions = {
  mutationConfig?: MutationConfig<typeof deleteConfigs>;
};

export const useDeleteConfigs = ({ mutationConfig }: UseDeleteConfigsOptions = {}) => {
  return useMutation({
    mutationFn: deleteConfigs,
    ...mutationConfig,
  });
};