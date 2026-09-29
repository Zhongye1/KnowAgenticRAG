import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 预览内容（Range 代理，支持任意 offset） */
export type GetDocumentPreviewContentParams = {
  document_id: string | number;
};

export const getDocumentPreviewContent = (params: GetDocumentPreviewContentParams): Promise<unknown> => {
  const { document_id } = params;
  return api.get(`/api/v1/documents/${document_id}/preview/content`).then((res) => res.data);
};

export const getDocumentPreviewContentQueryOptions = (params: GetDocumentPreviewContentParams) => {
  return queryOptions({
    queryKey: ['documents', 'get-document-preview-content', params],
    queryFn: () => getDocumentPreviewContent(params),
  });
};

type UseGetDocumentPreviewContentOptions = {
  params: GetDocumentPreviewContentParams;
  queryConfig?: QueryConfig<typeof getDocumentPreviewContentQueryOptions>;
};

export const useGetDocumentPreviewContent = (options: UseGetDocumentPreviewContentOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDocumentPreviewContentQueryOptions(params),
    ...queryConfig,
  });
};