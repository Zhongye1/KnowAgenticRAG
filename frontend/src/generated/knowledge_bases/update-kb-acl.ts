import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { KBAclDetail, KBAclUpdateParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新知识库授权组（全量替换） */
export type UpdateKbAclParams = {
  kb_name: string | number;
  data: KBAclUpdateParam;
};

export const updateKbAcl = (params: UpdateKbAclParams): Promise<KBAclDetail> => {
  const { kb_name, data } = params;
  return api.put(`/api/v1/knowledge_bases/${kb_name}/acl`, data).then((res) => res.data);
};

type UseUpdateKbAclOptions = {
  mutationConfig?: MutationConfig<typeof updateKbAcl>;
};

export const useUpdateKbAcl = ({ mutationConfig }: UseUpdateKbAclOptions = {}) => {
  return useMutation({
    mutationFn: updateKbAcl,
    ...mutationConfig,
  });
};