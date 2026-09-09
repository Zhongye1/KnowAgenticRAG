import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 清空登录日志 */

export const deleteAllLoginLogs = (): Promise<unknown> => {
  return api.delete(`/api/v1/logs/login/all`).then((res) => res.data);
};

type UseDeleteAllLoginLogsOptions = {
  mutationConfig?: MutationConfig<typeof deleteAllLoginLogs>;
};

export const useDeleteAllLoginLogs = ({ mutationConfig }: UseDeleteAllLoginLogsOptions = {}) => {
  return useMutation({
    mutationFn: deleteAllLoginLogs,
    ...mutationConfig,
  });
};