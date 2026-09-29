import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { DocumentItem, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 文档列表 */
export type GetDocumentsParams = {
  kb_name?: string | null;
  query?: string | null;
  source_type?: string | null;
  status?: string | null;
  page?: number;
  size?: number;
};

export const getDocuments = (params: GetDocumentsParams): Promise<PageData<DocumentItem>> => {
  const { kb_name, query, source_type, status, page, size } = params;
  return api.get(`/api/v1/documents`, { params: { kb_name, query, source_type, status, page, size } }).then((res) => res.data);
};

export const getDocumentsQueryOptions = (params: GetDocumentsParams) => {
  return queryOptions({
    queryKey: ['documents', 'get-documents', params],
    queryFn: () => getDocuments(params),
  });
};

type UseGetDocumentsOptions = {
  params: GetDocumentsParams;
  queryConfig?: QueryConfig<typeof getDocumentsQueryOptions>;
};

export const useGetDocuments = (options: UseGetDocumentsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDocumentsQueryOptions(params),
    ...queryConfig,
  });
};