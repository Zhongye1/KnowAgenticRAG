import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateTaskSchedulerParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新任务调度 */
export type UpdateTaskSchedulerParams = {
  pk: string | number;
  data: UpdateTaskSchedulerParam;
};

export const updateTaskScheduler = (params: UpdateTaskSchedulerParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/schedulers/${pk}`, data).then((res) => res.data);
};

type UseUpdateTaskSchedulerOptions = {
  mutationConfig?: MutationConfig<typeof updateTaskScheduler>;
};

export const useUpdateTaskScheduler = ({ mutationConfig }: UseUpdateTaskSchedulerOptions = {}) => {
  return useMutation({
    mutationFn: updateTaskScheduler,
    ...mutationConfig,
  });
};