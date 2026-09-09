import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateDeptParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新部门 */
export type UpdateDeptParams = {
  pk: string | number;
  data: UpdateDeptParam;
};

export const updateDept = (params: UpdateDeptParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/depts/${pk}`, data).then((res) => res.data);
};

type UseUpdateDeptOptions = {
  mutationConfig?: MutationConfig<typeof updateDept>;
};

export const useUpdateDept = ({ mutationConfig }: UseUpdateDeptOptions = {}) => {
  return useMutation({
    mutationFn: updateDept,
    ...mutationConfig,
  });
};