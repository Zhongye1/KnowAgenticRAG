import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DocAclDetail, DocAclUpdateParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新文档 ACL（DB 为准 + Milvus 传播） */
export type UpdateDocumentAclParams = {
  document_id: string | number;
  data: DocAclUpdateParam;
};

export const updateDocumentAcl = (params: UpdateDocumentAclParams): Promise<DocAclDetail> => {
  const { document_id, data } = params;
  return api.put(`/api/v1/documents/${document_id}/acl`, data).then((res) => res.data);
};

type UseUpdateDocumentAclOptions = {
  mutationConfig?: MutationConfig<typeof updateDocumentAcl>;
};

export const useUpdateDocumentAcl = ({ mutationConfig }: UseUpdateDocumentAclOptions = {}) => {
  return useMutation({
    mutationFn: updateDocumentAcl,
    ...mutationConfig,
  });
};