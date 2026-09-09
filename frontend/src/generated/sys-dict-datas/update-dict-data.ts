import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateDictDataParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新字典数据 */
export type UpdateDictDataParams = {
  pk: string | number;
  data: UpdateDictDataParam;
};

export const updateDictData = (params: UpdateDictDataParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/dict-datas/${pk}`, data).then((res) => res.data);
};

type UseUpdateDictDataOptions = {
  mutationConfig?: MutationConfig<typeof updateDictData>;
};

export const useUpdateDictData = ({ mutationConfig }: UseUpdateDictDataOptions = {}) => {
  return useMutation({
    mutationFn: updateDictData,
    ...mutationConfig,
  });
};