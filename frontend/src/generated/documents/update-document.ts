import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DocumentItem, DocumentUpdateParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新文档元数据 */
export type UpdateDocumentParams = {
  document_id: string | number;
  data: DocumentUpdateParam;
};

export const updateDocument = (params: UpdateDocumentParams): Promise<DocumentItem> => {
  const { document_id, data } = params;
  return api.patch(`/api/v1/documents/${document_id}`, data).then((res) => res.data);
};

type UseUpdateDocumentOptions = {
  mutationConfig?: MutationConfig<typeof updateDocument>;
};

export const useUpdateDocument = ({ mutationConfig }: UseUpdateDocumentOptions = {}) => {
  return useMutation({
    mutationFn: updateDocument,
    ...mutationConfig,
  });
};