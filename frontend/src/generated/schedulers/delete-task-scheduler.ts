import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 删除任务调度 */
export type DeleteTaskSchedulerParams = {
  pk: string | number;
};

export const deleteTaskScheduler = (params: DeleteTaskSchedulerParams): Promise<unknown> => {
  const { pk } = params;
  return api.delete(`/api/v1/schedulers/${pk}`).then((res) => res.data);
};

type UseDeleteTaskSchedulerOptions = {
  mutationConfig?: MutationConfig<typeof deleteTaskScheduler>;
};

export const useDeleteTaskScheduler = ({ mutationConfig }: UseDeleteTaskSchedulerOptions = {}) => {
  return useMutation({
    mutationFn: deleteTaskScheduler,
    ...mutationConfig,
  });
};