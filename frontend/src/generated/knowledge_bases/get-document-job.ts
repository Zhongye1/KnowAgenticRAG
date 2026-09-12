import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { IngestJobItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 摄取任务详情 */
export type GetDocumentJobParams = {
  kb_name: string | number;
  document_id: string | number;
  job_id: string | number;
};

export const getDocumentJob = (params: GetDocumentJobParams): Promise<IngestJobItem> => {
  const { kb_name, document_id, job_id } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/documents/${document_id}/jobs/${job_id}`).then((res) => res.data);
};

export const getDocumentJobQueryOptions = (params: GetDocumentJobParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-document-job', params],
    queryFn: () => getDocumentJob(params),
  });
};

type UseGetDocumentJobOptions = {
  params: GetDocumentJobParams;
  queryConfig?: QueryConfig<typeof getDocumentJobQueryOptions>;
};

export const useGetDocumentJob = (options: UseGetDocumentJobOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDocumentJobQueryOptions(params),
    ...queryConfig,
  });
};