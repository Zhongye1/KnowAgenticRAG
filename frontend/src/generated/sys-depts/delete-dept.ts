import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 删除部门 */
export type DeleteDeptParams = {
  pk: string | number;
};

export const deleteDept = (params: DeleteDeptParams): Promise<unknown> => {
  const { pk } = params;
  return api.delete(`/api/v1/sys/depts/${pk}`).then((res) => res.data);
};

type UseDeleteDeptOptions = {
  mutationConfig?: MutationConfig<typeof deleteDept>;
};

export const useDeleteDept = ({ mutationConfig }: UseDeleteDeptOptions = {}) => {
  return useMutation({
    mutationFn: deleteDept,
    ...mutationConfig,
  });
};