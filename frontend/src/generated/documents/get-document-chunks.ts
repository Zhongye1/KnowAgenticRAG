import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { ChunkItem, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 文档分块浏览（只读，来源调试/评估） */
export type GetDocumentChunksParams = {
  document_id: string | number;
  version?: number | null;
  page?: number;
  size?: number;
};

export const getDocumentChunks = (params: GetDocumentChunksParams): Promise<PageData<ChunkItem>> => {
  const { document_id, version, page, size } = params;
  return api.get(`/api/v1/documents/${document_id}/chunks`, { params: { version, page, size } }).then((res) => res.data);
};

export const getDocumentChunksQueryOptions = (params: GetDocumentChunksParams) => {
  return queryOptions({
    queryKey: ['documents', 'get-document-chunks', params],
    queryFn: () => getDocumentChunks(params),
  });
};

type UseGetDocumentChunksOptions = {
  params: GetDocumentChunksParams;
  queryConfig?: QueryConfig<typeof getDocumentChunksQueryOptions>;
};

export const useGetDocumentChunks = (options: UseGetDocumentChunksOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDocumentChunksQueryOptions(params),
    ...queryConfig,
  });
};