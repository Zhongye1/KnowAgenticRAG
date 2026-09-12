import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { DocumentStatusItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 文档摄取状态/进度 */
export type GetDocumentStatusParams = {
  kb_name: string | number;
  document_id: string | number;
};

export const getDocumentStatus = (params: GetDocumentStatusParams): Promise<DocumentStatusItem> => {
  const { kb_name, document_id } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/documents/${document_id}/status`).then((res) => res.data);
};

export const getDocumentStatusQueryOptions = (params: GetDocumentStatusParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-document-status', params],
    queryFn: () => getDocumentStatus(params),
  });
};

type UseGetDocumentStatusOptions = {
  params: GetDocumentStatusParams;
  queryConfig?: QueryConfig<typeof getDocumentStatusQueryOptions>;
};

export const useGetDocumentStatus = (options: UseGetDocumentStatusOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDocumentStatusQueryOptions(params),
    ...queryConfig,
  });
};