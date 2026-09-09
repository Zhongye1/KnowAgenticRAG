import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { KBIngestionVolumeItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 摄入时间序列 */
export type GetKnowledgeBaseIngestionVolumeParams = {
  kb_name: string | number;
  days?: number;
};

export const getKnowledgeBaseIngestionVolume = (params: GetKnowledgeBaseIngestionVolumeParams): Promise<KBIngestionVolumeItem[]> => {
  const { kb_name, days } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/ingestion-volume`, { params: { days } }).then((res) => res.data);
};

export const getKnowledgeBaseIngestionVolumeQueryOptions = (params: GetKnowledgeBaseIngestionVolumeParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-knowledge-base-ingestion-volume', params],
    queryFn: () => getKnowledgeBaseIngestionVolume(params),
  });
};

type UseGetKnowledgeBaseIngestionVolumeOptions = {
  params: GetKnowledgeBaseIngestionVolumeParams;
  queryConfig?: QueryConfig<typeof getKnowledgeBaseIngestionVolumeQueryOptions>;
};

export const useGetKnowledgeBaseIngestionVolume = (options: UseGetKnowledgeBaseIngestionVolumeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getKnowledgeBaseIngestionVolumeQueryOptions(params),
    ...queryConfig,
  });
};