import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { IngestResultItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 触发已登记文档摄取（幂等；摄取中 409） */
export type IngestRegisteredDocumentParams = {
  kb_name: string | number;
  document_id: string | number;
};

export const ingestRegisteredDocument = (params: IngestRegisteredDocumentParams): Promise<IngestResultItem> => {
  const { kb_name, document_id } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/documents/${document_id}/ingest`).then((res) => res.data);
};

type UseIngestRegisteredDocumentOptions = {
  mutationConfig?: MutationConfig<typeof ingestRegisteredDocument>;
};

export const useIngestRegisteredDocument = ({ mutationConfig }: UseIngestRegisteredDocumentOptions = {}) => {
  return useMutation({
    mutationFn: ingestRegisteredDocument,
    ...mutationConfig,
  });
};