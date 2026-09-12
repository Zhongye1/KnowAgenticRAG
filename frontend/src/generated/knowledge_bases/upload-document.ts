import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DocumentUploadItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 上传文档（对象存储 + 登记 + 格式/限额关口，不触发摄取） */
export type UploadDocumentParams = {
  kb_name: string | number;
  file: File;
  source_type?: string | null;
};

export const uploadDocument = (params: UploadDocumentParams): Promise<DocumentUploadItem> => {
  const { kb_name, file, source_type } = params;
  const formData = new FormData();
  formData.append('file', file);
  if (source_type) formData.append('source_type', source_type);
  return api.post(`/api/v1/knowledge_bases/${kb_name}/documents`, formData).then((res) => res.data);
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