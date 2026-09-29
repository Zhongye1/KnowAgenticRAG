import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createFolder } from '@/generated/knowledge_bases/create-folder';
import { deleteFolder } from '@/generated/knowledge_bases/delete-folder';
import { getFolderTree } from '@/generated/knowledge_bases/get-folder-tree';
import { moveFolder } from '@/generated/knowledge_bases/move-folder';
import { updateFolder } from '@/generated/knowledge_bases/update-folder';
import { moveDocument } from '@/generated/documents/move-document';
import { MutationConfig } from '@/lib/react-query';
import type { FolderTreeNode } from '@/generated/types';

/**
 * 知识库文件夹 API 层（kb 落地改造清单 Phase 1 / D51 的前端配套）。
 *
 * 树接口一次返回整棵树（含每级文档数）——后端在内存组装，不做递归查询；
 * 文档列表仍走**独立的分页接口**并按 `folder_id` 过滤，因为文档列表要过 ACL 可见集
 * 与分页器，内联进树会同时破坏两者。
 */

export const FOLDER_QUERY_KEY = ['knowledge_bases', 'folders'] as const;

/** 根目录在树里用哨兵 key 表示（后端用 `folder_id IS NULL` 表达根） */
export const ROOT_FOLDER_KEY = '__root__';

export const useFolderTree = (kbName: string, enabled = true) => {
  return useQuery<FolderTreeNode[]>({
    queryKey: [...FOLDER_QUERY_KEY, kbName],
    queryFn: () => getFolderTree({ kb_name: kbName }),
    enabled: enabled && Boolean(kbName),
  });
};

const useInvalidateFolders = (kbName: string) => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: [...FOLDER_QUERY_KEY, kbName],
    });
    // 文档的 folder_id 会随移动变化，列表也要刷
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
  };
};

export const useCreateFolder = (
  {
    kbName,
    mutationConfig,
  }: {
    kbName: string;
    mutationConfig?: MutationConfig<typeof createFolder>;
  } = { kbName: '' },
) => {
  const invalidate = useInvalidateFolders(kbName);
  return useMutation({
    mutationFn: createFolder,
    ...mutationConfig,
    onSuccess: (...args) => {
      invalidate();
      mutationConfig?.onSuccess?.(...args);
    },
  });
};

export const useUpdateFolder = (
  {
    kbName,
    mutationConfig,
  }: {
    kbName: string;
    mutationConfig?: MutationConfig<typeof updateFolder>;
  } = { kbName: '' },
) => {
  const invalidate = useInvalidateFolders(kbName);
  return useMutation({
    mutationFn: updateFolder,
    ...mutationConfig,
    onSuccess: (...args) => {
      invalidate();
      mutationConfig?.onSuccess?.(...args);
    },
  });
};

export const useMoveFolder = (
  {
    kbName,
    mutationConfig,
  }: {
    kbName: string;
    mutationConfig?: MutationConfig<typeof moveFolder>;
  } = { kbName: '' },
) => {
  const invalidate = useInvalidateFolders(kbName);
  return useMutation({
    mutationFn: moveFolder,
    ...mutationConfig,
    onSuccess: (...args) => {
      invalidate();
      mutationConfig?.onSuccess?.(...args);
    },
  });
};

export const useDeleteFolder = (
  {
    kbName,
    mutationConfig,
  }: {
    kbName: string;
    mutationConfig?: MutationConfig<typeof deleteFolder>;
  } = { kbName: '' },
) => {
  const invalidate = useInvalidateFolders(kbName);
  return useMutation({
    mutationFn: deleteFolder,
    ...mutationConfig,
    onSuccess: (...args) => {
      invalidate();
      mutationConfig?.onSuccess?.(...args);
    },
  });
};

export const useMoveDocument = ({
  mutationConfig,
}: {
  mutationConfig?: MutationConfig<typeof moveDocument>;
} = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: moveDocument,
    ...mutationConfig,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      mutationConfig?.onSuccess?.(...args);
    },
  });
};
