import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 清空操作日志 */

export const deleteAllOperaLogs = (): Promise<unknown> => {
  return api.delete(`/api/v1/logs/opera/all`).then((res) => res.data);
};

type UseDeleteAllOperaLogsOptions = {
  mutationConfig?: MutationConfig<typeof deleteAllOperaLogs>;
};

export const useDeleteAllOperaLogs = ({ mutationConfig }: UseDeleteAllOperaLogsOptions = {}) => {
  return useMutation({
    mutationFn: deleteAllOperaLogs,
    ...mutationConfig,
  });
};