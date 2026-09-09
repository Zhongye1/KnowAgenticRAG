import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateDeptParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建部门 */

export const createDept = (data: CreateDeptParam): Promise<unknown> => {
  return api.post(`/api/v1/sys/depts`, data).then((res) => res.data);
};

type UseCreateDeptOptions = {
  mutationConfig?: MutationConfig<typeof createDept>;
};

export const useCreateDept = ({ mutationConfig }: UseCreateDeptOptions = {}) => {
  return useMutation({
    mutationFn: createDept,
    ...mutationConfig,
  });
};