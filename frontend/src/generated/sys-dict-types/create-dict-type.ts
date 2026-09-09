import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateDictTypeParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建字典类型 */

export const createDictType = (data: CreateDictTypeParam): Promise<unknown> => {
  return api.post(`/api/v1/sys/dict-types`, data).then((res) => res.data);
};

type UseCreateDictTypeOptions = {
  mutationConfig?: MutationConfig<typeof createDictType>;
};

export const useCreateDictType = ({ mutationConfig }: UseCreateDictTypeOptions = {}) => {
  return useMutation({
    mutationFn: createDictType,
    ...mutationConfig,
  });
};