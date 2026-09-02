import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 删除文档（级联清理向量/OSS/登记） */
export type DeleteDocumentParams = {
  document_id: string | number;
};

export const deleteDocument = (params: DeleteDocumentParams): Promise<Record<string, number>> => {
  const { document_id } = params;
  return api.delete(`/api/v1/documents/${document_id}`).then((res) => res.data);
};

type UseDeleteDocumentOptions = {
  mutationConfig?: MutationConfig<typeof deleteDocument>;
};

export const useDeleteDocument = ({ mutationConfig }: UseDeleteDocumentOptions = {}) => {
  return useMutation({
    mutationFn: deleteDocument,
    ...mutationConfig,
  });
};