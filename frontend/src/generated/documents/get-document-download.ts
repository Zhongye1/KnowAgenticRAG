import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 文档下载链接（对象存储预签名 URL） */
export type GetDocumentDownloadParams = {
  document_id: string | number;
};

export const getDocumentDownload = (params: GetDocumentDownloadParams): Promise<Record<string, string>> => {
  const { document_id } = params;
  return api.get(`/api/v1/documents/${document_id}/download`).then((res) => res.data);
};

export const getDocumentDownloadQueryOptions = (params: GetDocumentDownloadParams) => {
  return queryOptions({
    queryKey: ['documents', 'get-document-download', params],
    queryFn: () => getDocumentDownload(params),
  });
};

type UseGetDocumentDownloadOptions = {
  params: GetDocumentDownloadParams;
  queryConfig?: QueryConfig<typeof getDocumentDownloadQueryOptions>;
};

export const useGetDocumentDownload = (options: UseGetDocumentDownloadOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDocumentDownloadQueryOptions(params),
    ...queryConfig,
  });
};