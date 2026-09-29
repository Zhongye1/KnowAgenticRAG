import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { BatchDocumentParam, BatchResult } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量重新摄取（逐条结果，不整批回滚） */

export const batchReindexDocuments = (data: BatchDocumentParam): Promise<BatchResult> => {
  return api.post(`/api/v1/documents/batch/reindex`, data).then((res) => res.data);
};

type UseBatchReindexDocumentsOptions = {
  mutationConfig?: MutationConfig<typeof batchReindexDocuments>;
};

export const useBatchReindexDocuments = ({ mutationConfig }: UseBatchReindexDocumentsOptions = {}) => {
  return useMutation({
    mutationFn: batchReindexDocuments,
    ...mutationConfig,
  });
};