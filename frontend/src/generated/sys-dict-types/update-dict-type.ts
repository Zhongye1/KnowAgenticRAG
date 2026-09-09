import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateDictTypeParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新字典类型 */
export type UpdateDictTypeParams = {
  pk: string | number;
  data: UpdateDictTypeParam;
};

export const updateDictType = (params: UpdateDictTypeParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/dict-types/${pk}`, data).then((res) => res.data);
};

type UseUpdateDictTypeOptions = {
  mutationConfig?: MutationConfig<typeof updateDictType>;
};

export const useUpdateDictType = ({ mutationConfig }: UseUpdateDictTypeOptions = {}) => {
  return useMutation({
    mutationFn: updateDictType,
    ...mutationConfig,
  });
};