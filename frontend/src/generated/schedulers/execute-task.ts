import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 执行任务 */
export type ExecuteTaskParams = {
  pk: string | number;
};

export const executeTask = (params: ExecuteTaskParams): Promise<unknown> => {
  const { pk } = params;
  return api.post(`/api/v1/schedulers/${pk}/execute`).then((res) => res.data);
};

type UseExecuteTaskOptions = {
  mutationConfig?: MutationConfig<typeof executeTask>;
};

export const useExecuteTask = ({ mutationConfig }: UseExecuteTaskOptions = {}) => {
  return useMutation({
    mutationFn: executeTask,
    ...mutationConfig,
  });
};