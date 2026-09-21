import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { KBTransferParam, KBTransferResult } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 转移知识库所有权（组织管理员兜底） */
export type TransferKnowledgeBaseOwnerParams = {
  kb_name: string | number;
  data: KBTransferParam;
};

export const transferKnowledgeBaseOwner = (params: TransferKnowledgeBaseOwnerParams): Promise<KBTransferResult> => {
  const { kb_name, data } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/transfer`, data).then((res) => res.data);
};

type UseTransferKnowledgeBaseOwnerOptions = {
  mutationConfig?: MutationConfig<typeof transferKnowledgeBaseOwner>;
};

export const useTransferKnowledgeBaseOwner = ({ mutationConfig }: UseTransferKnowledgeBaseOwnerOptions = {}) => {
  return useMutation({
    mutationFn: transferKnowledgeBaseOwner,
    ...mutationConfig,
  });
};