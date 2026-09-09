import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetRoleWithRelationDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取角色详情 */
export type GetRoleParams = {
  pk: string | number;
};

export const getRole = (params: GetRoleParams): Promise<GetRoleWithRelationDetail> => {
  const { pk } = params;
  return api.get(`/api/v1/sys/roles/${pk}`).then((res) => res.data);
};

export const getRoleQueryOptions = (params: GetRoleParams) => {
  return queryOptions({
    queryKey: ['sys-roles', 'get-role', params],
    queryFn: () => getRole(params),
  });
};

type UseGetRoleOptions = {
  params: GetRoleParams;
  queryConfig?: QueryConfig<typeof getRoleQueryOptions>;
};

export const useGetRole = (options: UseGetRoleOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getRoleQueryOptions(params),
    ...queryConfig,
  });
};