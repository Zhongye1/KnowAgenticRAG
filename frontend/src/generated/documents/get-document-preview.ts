import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { PreviewItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 文档预览描述（Office 首次访问触发转换） */
export type GetDocumentPreviewParams = {
  document_id: string | number;
  offset?: number;
};

export const getDocumentPreview = (params: GetDocumentPreviewParams): Promise<PreviewItem> => {
  const { document_id, offset } = params;
  return api.get(`/api/v1/documents/${document_id}/preview`, { params: { offset } }).then((res) => res.data);
};

export const getDocumentPreviewQueryOptions = (params: GetDocumentPreviewParams) => {
  return queryOptions({
    queryKey: ['documents', 'get-document-preview', params],
    queryFn: () => getDocumentPreview(params),
  });
};

type UseGetDocumentPreviewOptions = {
  params: GetDocumentPreviewParams;
  queryConfig?: QueryConfig<typeof getDocumentPreviewQueryOptions>;
};

export const useGetDocumentPreview = (options: UseGetDocumentPreviewOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDocumentPreviewQueryOptions(params),
    ...queryConfig,
  });
};