import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { FolderItem, FolderMoveParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 移动文件夹 */
export type MoveFolderParams = {
  kb_name: string | number;
  folder_id: string | number;
  data: FolderMoveParam;
};

export const moveFolder = (params: MoveFolderParams): Promise<FolderItem> => {
  const { kb_name, folder_id, data } = params;
  return api.post(`/api/v1/knowledge_bases/${kb_name}/folders/${folder_id}/move`, data).then((res) => res.data);
};

type UseMoveFolderOptions = {
  mutationConfig?: MutationConfig<typeof moveFolder>;
};

export const useMoveFolder = ({ mutationConfig }: UseMoveFolderOptions = {}) => {
  return useMutation({
    mutationFn: moveFolder,
    ...mutationConfig,
  });
};