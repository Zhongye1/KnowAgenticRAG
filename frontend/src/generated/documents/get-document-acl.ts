import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { DocAclDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 查询文档可见性与授权组 */
export type GetDocumentAclParams = {
  document_id: string | number;
};

export const getDocumentAcl = (params: GetDocumentAclParams): Promise<DocAclDetail> => {
  const { document_id } = params;
  return api.get(`/api/v1/documents/${document_id}/acl`).then((res) => res.data);
};

export const getDocumentAclQueryOptions = (params: GetDocumentAclParams) => {
  return queryOptions({
    queryKey: ['documents', 'get-document-acl', params],
    queryFn: () => getDocumentAcl(params),
  });
};

type UseGetDocumentAclOptions = {
  params: GetDocumentAclParams;
  queryConfig?: QueryConfig<typeof getDocumentAclQueryOptions>;
};

export const useGetDocumentAcl = (options: UseGetDocumentAclOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDocumentAclQueryOptions(params),
    ...queryConfig,
  });
};