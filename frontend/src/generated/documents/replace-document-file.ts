import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DocumentItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 替换文档文件（重新上传 OSS） */
export type ReplaceDocumentFileParams = {
  document_id: string | number;
  file: File;
};

export const replaceDocumentFile = (params: ReplaceDocumentFileParams): Promise<DocumentItem> => {
  const { document_id, file } = params;
  const formData = new FormData();
  formData.append('file', file);
  return api.put(`/api/v1/documents/${document_id}/file`, formData).then((res) => res.data);
};

type UseReplaceDocumentFileOptions = {
  mutationConfig?: MutationConfig<typeof replaceDocumentFile>;
};

export const useReplaceDocumentFile = ({ mutationConfig }: UseReplaceDocumentFileOptions = {}) => {
  return useMutation({
    mutationFn: replaceDocumentFile,
    ...mutationConfig,
  });
};