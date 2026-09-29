import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 删除文件夹（子项上浮到父级） */
export type DeleteFolderParams = {
  kb_name: string | number;
  folder_id: string | number;
};

export const deleteFolder = (params: DeleteFolderParams): Promise<unknown> => {
  const { kb_name, folder_id } = params;
  return api.delete(`/api/v1/knowledge_bases/${kb_name}/folders/${folder_id}`).then((res) => res.data);
};

type UseDeleteFolderOptions = {
  mutationConfig?: MutationConfig<typeof deleteFolder>;
};

export const useDeleteFolder = ({ mutationConfig }: UseDeleteFolderOptions = {}) => {
  return useMutation({
    mutationFn: deleteFolder,
    ...mutationConfig,
  });
};