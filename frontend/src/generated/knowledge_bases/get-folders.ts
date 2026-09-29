import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { FolderItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 文件夹扁平列表 */
export type GetFoldersParams = {
  kb_name: string | number;
};

export const getFolders = (params: GetFoldersParams): Promise<FolderItem[]> => {
  const { kb_name } = params;
  return api.get(`/api/v1/knowledge_bases/${kb_name}/folders`).then((res) => res.data);
};

export const getFoldersQueryOptions = (params: GetFoldersParams) => {
  return queryOptions({
    queryKey: ['knowledge_bases', 'get-folders', params],
    queryFn: () => getFolders(params),
  });
};

type UseGetFoldersOptions = {
  params: GetFoldersParams;
  queryConfig?: QueryConfig<typeof getFoldersQueryOptions>;
};

export const useGetFolders = (options: UseGetFoldersOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getFoldersQueryOptions(params),
    ...queryConfig,
  });
};