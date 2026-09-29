import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DocumentItem, DocumentMoveParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 移动文档到文件夹（D51） */
export type MoveDocumentParams = {
  document_id: string | number;
  data: DocumentMoveParam;
};

export const moveDocument = (params: MoveDocumentParams): Promise<DocumentItem> => {
  const { document_id, data } = params;
  return api.post(`/api/v1/documents/${document_id}/move`, data).then((res) => res.data);
};

type UseMoveDocumentOptions = {
  mutationConfig?: MutationConfig<typeof moveDocument>;
};

export const useMoveDocument = ({ mutationConfig }: UseMoveDocumentOptions = {}) => {
  return useMutation({
    mutationFn: moveDocument,
    ...mutationConfig,
  });
};