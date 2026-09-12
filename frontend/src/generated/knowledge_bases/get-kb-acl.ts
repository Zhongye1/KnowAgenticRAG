import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { KBAclDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 查询知识库授权组列表 */
export type GetKbAclParams = {
  kb_name: string | number;
};

export const getKbAcl = (params: GetKbAclParams): Promise<KBAclDetail> => {
  const { kb_name } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/acl`).then((res) => res.data);
};

export const getKbAclQueryOptions = (params: GetKbAclParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-kb-acl', params],
    queryFn: () => getKbAcl(params),
  });
};

type UseGetKbAclOptions = {
  params: GetKbAclParams;
  queryConfig?: QueryConfig<typeof getKbAclQueryOptions>;
};

export const useGetKbAcl = (options: UseGetKbAclOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getKbAclQueryOptions(params),
    ...queryConfig,
  });
};