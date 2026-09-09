import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DeleteDictTypeParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除字典类型 */

export const deleteDictTypes = (data: DeleteDictTypeParam): Promise<unknown> => {
  return api.delete(`/api/v1/sys/dict-types`, { data }).then((res) => res.data);
};

type UseDeleteDictTypesOptions = {
  mutationConfig?: MutationConfig<typeof deleteDictTypes>;
};

export const useDeleteDictTypes = ({ mutationConfig }: UseDeleteDictTypesOptions = {}) => {
  return useMutation({
    mutationFn: deleteDictTypes,
    ...mutationConfig,
  });
};