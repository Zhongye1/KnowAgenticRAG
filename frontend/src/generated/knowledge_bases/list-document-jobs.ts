import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { IngestJobItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 文档摄取任务列表（细粒度进度，spec D5） */
export type ListDocumentJobsParams = {
  kb_name: string | number;
  document_id: string | number;
};

export const listDocumentJobs = (params: ListDocumentJobsParams): Promise<IngestJobItem[]> => {
  const { kb_name, document_id } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/documents/${document_id}/jobs`).then((res) => res.data);
};

export const listDocumentJobsQueryOptions = (params: ListDocumentJobsParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'list-document-jobs', params],
    queryFn: () => listDocumentJobs(params),
  });
};

type UseListDocumentJobsOptions = {
  params: ListDocumentJobsParams;
  queryConfig?: QueryConfig<typeof listDocumentJobsQueryOptions>;
};

export const useListDocumentJobs = (options: UseListDocumentJobsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...listDocumentJobsQueryOptions(params),
    ...queryConfig,
  });
};