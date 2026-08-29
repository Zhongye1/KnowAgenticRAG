import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DeleteOperaLogParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除操作日志 */

export const deleteOperaLogs = (data: DeleteOperaLogParam): Promise<unknown> => {
  return api.delete(`/api/v1/logs/opera`, data).then((res) => res.data);
};

type UseDeleteOperaLogsOptions = {
  mutationConfig?: MutationConfig<typeof deleteOperaLogs>;
};

export const useDeleteOperaLogs = ({ mutationConfig }: UseDeleteOperaLogsOptions = {}) => {
  return useMutation({
    mutationFn: deleteOperaLogs,
    ...mutationConfig,
  });
};