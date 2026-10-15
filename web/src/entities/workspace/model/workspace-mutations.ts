/**
 * 个人空间的写入层。
 *
 * 四个动作共用一份失效规则：任何写入都可能改动任意一层目录的列表（新建出现在父目录、删除可能
 * 整棵子树消失、上传一次写多个文件），因此统一失效 `WORKSPACE_QUERY_ROOT` 下的目录查询，不做
 * 逐条改写。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import {
  createWorkspaceDirectory,
  deleteWorkspaceEntry,
  saveWorkspaceFile,
  uploadWorkspaceFiles,
} from '../api/workspace-api';
import type { FileEntry } from '@/shared/lib/files';
import { WORKSPACE_QUERY_ROOT } from './workspace-queries';

const useInvalidateWorkspace = (): (() => void) => {
  const client = useQueryClient();

  return () => {
    void client.invalidateQueries({ queryKey: WORKSPACE_QUERY_ROOT });
  };
};

/** 新建目录；解析值是服务端给的目录路径（拿不到时为空串）。 */
export const useCreateWorkspaceDirectory = (): UseMutationResult<
  string,
  Error,
  { parentPath: string; name: string }
> => {
  const invalidate = useInvalidateWorkspace();

  return useMutation({
    mutationFn: createWorkspaceDirectory,
    onSuccess: invalidate,
  });
};

/** 删除一个条目（目录含子树）。 */
export const useDeleteWorkspaceEntry = (): UseMutationResult<
  void,
  Error,
  { path: string }
> => {
  const invalidate = useInvalidateWorkspace();

  return useMutation({
    mutationFn: deleteWorkspaceEntry,
    onSuccess: invalidate,
  });
};

/** 上传文件；解析值是服务端写入的条目。 */
export const useUploadWorkspaceFiles = (): UseMutationResult<
  FileEntry[],
  Error,
  { parentPath: string; files: File[] }
> => {
  const invalidate = useInvalidateWorkspace();

  return useMutation({
    mutationFn: uploadWorkspaceFiles,
    onSuccess: invalidate,
  });
};

/** 保存文本文件内容；解析值是服务端归一后的条目。 */
export const useSaveWorkspaceFile = (): UseMutationResult<
  FileEntry | null,
  Error,
  { path: string; content: string }
> => {
  const invalidate = useInvalidateWorkspace();

  return useMutation({
    mutationFn: saveWorkspaceFile,
    onSuccess: invalidate,
  });
};
