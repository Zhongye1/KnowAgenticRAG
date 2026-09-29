import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { BatchDocumentParam, BatchResult } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除文档（逐条结果，不整批回滚） */

export const batchDeleteDocuments = (data: BatchDocumentParam): Promise<BatchResult> => {
  return api.delete(`/api/v1/documents/batch`, { data }).then((res) => res.data);
};

type UseBatchDeleteDocumentsOptions = {
  mutationConfig?: MutationConfig<typeof batchDeleteDocuments>;
};

export const useBatchDeleteDocuments = ({ mutationConfig }: UseBatchDeleteDocumentsOptions = {}) => {
  return useMutation({
    mutationFn: batchDeleteDocuments,
    ...mutationConfig,
  });
};