import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDeptTree } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取部门树 */
export type GetDeptTreeParams = {
  name?: string | null;
  leader?: string | null;
  phone?: string | null;
  status?: number | null;
};

export const getDeptTree = (params: GetDeptTreeParams): Promise<GetDeptTree[]> => {
  const { name, leader, phone, status } = params;
  return api.get(`/api/v1/sys/depts`, { params: { name, leader, phone, status } }).then((res) => res.data);
};

export const getDeptTreeQueryOptions = (params: GetDeptTreeParams) => {
  return queryOptions({
    queryKey: ['sys-depts', 'get-dept-tree', params],
    queryFn: () => getDeptTree(params),
  });
};

type UseGetDeptTreeOptions = {
  params: GetDeptTreeParams;
  queryConfig?: QueryConfig<typeof getDeptTreeQueryOptions>;
};

export const useGetDeptTree = (options: UseGetDeptTreeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDeptTreeQueryOptions(params),
    ...queryConfig,
  });
};