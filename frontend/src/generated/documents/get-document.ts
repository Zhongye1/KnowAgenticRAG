import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { DocumentItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 文档详情 */
export type GetDocumentParams = {
  document_id: string | number;
};

export const getDocument = (params: GetDocumentParams): Promise<DocumentItem> => {
  const { document_id } = params;
  return api.get(`/api/v1/documents/${document_id}`).then((res) => res.data);
};

export const getDocumentQueryOptions = (params: GetDocumentParams) => {
  return queryOptions({
    queryKey: ['documents', 'get-document', params],
    queryFn: () => getDocument(params),
  });
};

type UseGetDocumentOptions = {
  params: GetDocumentParams;
  queryConfig?: QueryConfig<typeof getDocumentQueryOptions>;
};

export const useGetDocument = (options: UseGetDocumentOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDocumentQueryOptions(params),
    ...queryConfig,
  });
};