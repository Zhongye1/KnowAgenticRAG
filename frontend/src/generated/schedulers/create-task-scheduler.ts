import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateTaskSchedulerParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建任务调度 */

export const createTaskScheduler = (data: CreateTaskSchedulerParam): Promise<unknown> => {
  return api.post(`/api/v1/schedulers`, data).then((res) => res.data);
};

type UseCreateTaskSchedulerOptions = {
  mutationConfig?: MutationConfig<typeof createTaskScheduler>;
};

export const useCreateTaskScheduler = ({ mutationConfig }: UseCreateTaskSchedulerOptions = {}) => {
  return useMutation({
    mutationFn: createTaskScheduler,
    ...mutationConfig,
  });
};