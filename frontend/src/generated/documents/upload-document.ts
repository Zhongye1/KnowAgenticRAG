import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DocumentItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 上传文档（存入对象存储） */
export type UploadDocumentParams = {
  file: File;
  kb_name: string;
  source_type?: string | null;
};

export const uploadDocument = (params: UploadDocumentParams): Promise<DocumentItem> => {
  const { file, kb_name, source_type } = params;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kb_name', kb_name);
  if (source_type) formData.append('source_type', source_type);
  return api.post(`/api/v1/documents`, formData).then((res) => res.data);
};

type UseUploadDocumentOptions = {
  mutationConfig?: MutationConfig<typeof uploadDocument>;
};

export const useUploadDocument = ({ mutationConfig }: UseUploadDocumentOptions = {}) => {
  return useMutation({
    mutationFn: uploadDocument,
    ...mutationConfig,
  });
};