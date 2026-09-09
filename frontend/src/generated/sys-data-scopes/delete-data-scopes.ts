import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DeleteDataScopeParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除数据范围 */

export const deleteDataScopes = (data: DeleteDataScopeParam): Promise<unknown> => {
  return api.delete(`/api/v1/sys/data-scopes`, { data }).then((res) => res.data);
};

type UseDeleteDataScopesOptions = {
  mutationConfig?: MutationConfig<typeof deleteDataScopes>;
};

export const useDeleteDataScopes = ({ mutationConfig }: UseDeleteDataScopesOptions = {}) => {
  return useMutation({
    mutationFn: deleteDataScopes,
    ...mutationConfig,
  });
};