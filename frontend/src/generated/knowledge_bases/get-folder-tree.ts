import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { FolderTreeNode } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 文件夹树（含每级文档数） */
export type GetFolderTreeParams = {
  kb_name: string | number;
};

export const getFolderTree = (params: GetFolderTreeParams): Promise<FolderTreeNode[]> => {
  const { kb_name } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/folders/tree`).then((res) => res.data);
};

export const getFolderTreeQueryOptions = (params: GetFolderTreeParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-folder-tree', params],
    queryFn: () => getFolderTree(params),
  });
};

type UseGetFolderTreeOptions = {
  params: GetFolderTreeParams;
  queryConfig?: QueryConfig<typeof getFolderTreeQueryOptions>;
};

export const useGetFolderTree = (options: UseGetFolderTreeOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getFolderTreeQueryOptions(params),
    ...queryConfig,
  });
};