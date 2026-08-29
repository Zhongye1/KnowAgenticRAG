import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateDataScopeParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新数据范围 */
export type UpdateDataScopeParams = {
  pk: string | number;
  data: UpdateDataScopeParam;
};

export const updateDataScope = (params: UpdateDataScopeParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/data-scopes/${pk}`, data).then((res) => res.data);
};

type UseUpdateDataScopeOptions = {
  mutationConfig?: MutationConfig<typeof updateDataScope>;
};

export const useUpdateDataScope = ({ mutationConfig }: UseUpdateDataScopeOptions = {}) => {
  return useMutation({
    mutationFn: updateDataScope,
    ...mutationConfig,
  });
};