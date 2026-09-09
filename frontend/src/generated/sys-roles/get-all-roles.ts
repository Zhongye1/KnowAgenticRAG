import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetRoleDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取所有角色 */

export const getAllRoles = (): Promise<GetRoleDetail[]> => {
  return api.get(`/api/v1/sys/roles/all`).then((res) => res.data);
};

export const getAllRolesQueryOptions = () => {
  return queryOptions({
    queryKey: ['sys-roles', 'get-all-roles'],
    queryFn: () => getAllRoles(),
  });
};

type UseGetAllRolesOptions = {
  queryConfig?: QueryConfig<typeof getAllRolesQueryOptions>;
};

export const useGetAllRoles = ({ queryConfig }: UseGetAllRolesOptions = {}) => {
  return useQuery({
    ...getAllRolesQueryOptions(),
    ...queryConfig,
  });
};