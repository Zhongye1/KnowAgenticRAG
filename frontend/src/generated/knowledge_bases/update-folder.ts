import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { FolderItem, FolderUpdateParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 重命名 / 改排序 */
export type UpdateFolderParams = {
  kb_name: string | number;
  folder_id: string | number;
  data: FolderUpdateParam;
};

export const updateFolder = (params: UpdateFolderParams): Promise<FolderItem> => {
  const { kb_name, folder_id, data } = params;
  return api.patch(`/api/v1/knowledge_bases/${kb_name}/folders/${folder_id}`, data).then((res) => res.data);
};

type UseUpdateFolderOptions = {
  mutationConfig?: MutationConfig<typeof updateFolder>;
};

export const useUpdateFolder = ({ mutationConfig }: UseUpdateFolderOptions = {}) => {
  return useMutation({
    mutationFn: updateFolder,
    ...mutationConfig,
  });
};