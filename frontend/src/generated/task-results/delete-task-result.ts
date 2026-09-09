import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DeleteTaskResultParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除任务结果 */

export const deleteTaskResult = (data: DeleteTaskResultParam): Promise<unknown> => {
  return api.delete(`/api/v1/task-results`, { data }).then((res) => res.data);
};

type UseDeleteTaskResultOptions = {
  mutationConfig?: MutationConfig<typeof deleteTaskResult>;
};

export const useDeleteTaskResult = ({ mutationConfig }: UseDeleteTaskResultOptions = {}) => {
  return useMutation({
    mutationFn: deleteTaskResult,
    ...mutationConfig,
  });
};