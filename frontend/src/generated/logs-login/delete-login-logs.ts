import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DeleteLoginLogParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除登录日志 */

export const deleteLoginLogs = (data: DeleteLoginLogParam): Promise<unknown> => {
  return api.delete(`/api/v1/logs/login`, { data }).then((res) => res.data);
};

type UseDeleteLoginLogsOptions = {
  mutationConfig?: MutationConfig<typeof deleteLoginLogs>;
};

export const useDeleteLoginLogs = ({ mutationConfig }: UseDeleteLoginLogsOptions = {}) => {
  return useMutation({
    mutationFn: deleteLoginLogs,
    ...mutationConfig,
  });
};