import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { ExportCreated } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 发起整库导出（异步打包 ZIP） */
export type CreateExportParams = {
  kb_name: string | number;
};

export const createExport = (params: CreateExportParams): Promise<ExportCreated> => {
  const { kb_name } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/export`).then((res) => res.data);
};

type UseCreateExportOptions = {
  mutationConfig?: MutationConfig<typeof createExport>;
};

export const useCreateExport = ({ mutationConfig }: UseCreateExportOptions = {}) => {
  return useMutation({
    mutationFn: createExport,
    ...mutationConfig,
  });
};