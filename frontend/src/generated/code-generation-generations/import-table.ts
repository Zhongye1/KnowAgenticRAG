import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { ImportParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 导入代码生成业务和模型列（仅开发环境） */

export const importTable = (data: ImportParam): Promise<unknown> => {
  return api.post(`/api/v1/code-generation/generations/imports`, data).then((res) => res.data);
};

type UseImportTableOptions = {
  mutationConfig?: MutationConfig<typeof importTable>;
};

export const useImportTable = ({ mutationConfig }: UseImportTableOptions = {}) => {
  return useMutation({
    mutationFn: importTable,
    ...mutationConfig,
  });
};