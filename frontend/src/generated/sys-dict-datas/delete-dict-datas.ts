import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DeleteDictDataParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除字典数据 */

export const deleteDictDatas = (data: DeleteDictDataParam): Promise<unknown> => {
  return api.delete(`/api/v1/sys/dict-datas`, data).then((res) => res.data);
};

type UseDeleteDictDatasOptions = {
  mutationConfig?: MutationConfig<typeof deleteDictDatas>;
};

export const useDeleteDictDatas = ({ mutationConfig }: UseDeleteDictDatasOptions = {}) => {
  return useMutation({
    mutationFn: deleteDictDatas,
    ...mutationConfig,
  });
};