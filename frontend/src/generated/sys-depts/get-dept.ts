import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDeptDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取部门详情 */
export type GetDeptParams = {
  pk: string | number;
};

export const getDept = (params: GetDeptParams): Promise<GetDeptDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/depts/${pk}`).then((res) => res.data);
};

export const getDeptQueryOptions = (params: GetDeptParams) => {
  return queryOptions({
    queryKey: ['sys-depts', 'get-dept', params],
    queryFn: () => getDept(params),
  });
};

type UseGetDeptOptions = {
  params: GetDeptParams;
  queryConfig?: QueryConfig<typeof getDeptQueryOptions>;
};

export const useGetDept = (options: UseGetDeptOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDeptQueryOptions(params),
    ...queryConfig,
  });
};