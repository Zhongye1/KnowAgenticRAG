import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 撤销任务 */
export type RevokeTaskParams = {
  task_id: string | number;
};

export const revokeTask = (params: RevokeTaskParams): Promise<unknown> => {
  const { task_id } = params;
  return api.delete(`/api/v1/tasks/${task_id}/cancel`).then((res) => res.data);
};

type UseRevokeTaskOptions = {
  mutationConfig?: MutationConfig<typeof revokeTask>;
};

export const useRevokeTask = ({ mutationConfig }: UseRevokeTaskOptions = {}) => {
  return useMutation({
    mutationFn: revokeTask,
    ...mutationConfig,
  });
};