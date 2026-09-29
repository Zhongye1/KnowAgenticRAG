import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 统计对账与修复（chunk_count 漂移） */
export type PostStatsRepairParams = {
  kb_name: string | number;
};

export const postStatsRepair = (params: PostStatsRepairParams): Promise<unknown> => {
  const { kb_name } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/stats/repair`).then((res) => res.data);
};

type UsePostStatsRepairOptions = {
  mutationConfig?: MutationConfig<typeof postStatsRepair>;
};

export const usePostStatsRepair = ({ mutationConfig }: UsePostStatsRepairOptions = {}) => {
  return useMutation({
    mutationFn: postStatsRepair,
    ...mutationConfig,
  });
};