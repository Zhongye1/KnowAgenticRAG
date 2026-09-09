import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateDictDataParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建字典数据 */

export const createDictData = (data: CreateDictDataParam): Promise<unknown> => {
  return api.post(`/api/v1/sys/dict-datas`, data).then((res) => res.data);
};

type UseCreateDictDataOptions = {
  mutationConfig?: MutationConfig<typeof createDictData>;
};

export const useCreateDictData = ({ mutationConfig }: UseCreateDictDataOptions = {}) => {
  return useMutation({
    mutationFn: createDictData,
    ...mutationConfig,
  });
};