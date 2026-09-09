import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量更新参数配置 */
export type BulkUpdateConfigParamsData = {
};

export const bulkUpdateConfig = (data: BulkUpdateConfigParamsData): Promise<unknown> => {
  return api.put(`/api/v1/sys/configs`, data).then((res) => res.data);
};

type UseBulkUpdateConfigOptions = {
  mutationConfig?: MutationConfig<typeof bulkUpdateConfig>;
};

export const useBulkUpdateConfig = ({ mutationConfig }: UseBulkUpdateConfigOptions = {}) => {
  return useMutation({
    mutationFn: bulkUpdateConfig,
    ...mutationConfig,
  });
};