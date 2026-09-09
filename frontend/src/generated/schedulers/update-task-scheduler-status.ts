import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新任务调度状态 */
export type UpdateTaskSchedulerStatusParams = {
  pk: string | number;
};

export const updateTaskSchedulerStatus = (params: UpdateTaskSchedulerStatusParams): Promise<unknown> => {
  const { pk } = params;
  return api.put(`/api/v1/schedulers/${pk}/status`).then((res) => res.data);
};

type UseUpdateTaskSchedulerStatusOptions = {
  mutationConfig?: MutationConfig<typeof updateTaskSchedulerStatus>;
};

export const useUpdateTaskSchedulerStatus = ({ mutationConfig }: UseUpdateTaskSchedulerStatusOptions = {}) => {
  return useMutation({
    mutationFn: updateTaskSchedulerStatus,
    ...mutationConfig,
  });
};