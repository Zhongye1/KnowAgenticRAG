import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { FolderCreateParam, FolderItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 新建文件夹 */
export type CreateFolderParams = {
  kb_name: string | number;
  data: FolderCreateParam;
};

export const createFolder = (params: CreateFolderParams): Promise<FolderItem> => {
  const { kb_name, data } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/folders`, data).then((res) => res.data);
};

type UseCreateFolderOptions = {
  mutationConfig?: MutationConfig<typeof createFolder>;
};

export const useCreateFolder = ({ mutationConfig }: UseCreateFolderOptions = {}) => {
  return useMutation({
    mutationFn: createFolder,
    ...mutationConfig,
  });
};