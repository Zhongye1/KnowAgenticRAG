/**
 * 文件面板的写操作编排。
 *
 * 把「mutate + 通知 + 确认 + 分批 + 门禁」从表格组件里抬出来：界面只负责展示，并把视图事实
 * （`items` / `selectedIds` / `stale` / `filtered` / `virtualPath`）喂进来。
 *
 * 读侧不在这里：列表查询由表格持有，写操作的 `onSuccess` 已由 `model/knowledge-queries.ts`
 * 的 `invalidateFileViews` 同时失效文件列表与详情（面板首行的统计按钮读的就是详情）。
 */
import * as React from 'react';

import { useConfirm } from '@/shared/ui/confirm-dialog';
import {
  asText,
  useNotifications,
  type NotificationInput,
} from '@/shared/ui/notifications';

import { knowledgeApi, type KnowledgeFileItem } from '../api/knowledge-api';
import { triggerBlobDownload } from '../lib/file-download';
import {
  canDeleteFile,
  canIndexFile,
  canMutateKnowledgeFiles,
  canParseFile,
} from '../lib/knowledge-files';
import {
  useCreateKnowledgeFolder,
  useDeleteKnowledgeFile,
  useDeleteKnowledgeFiles,
  useIndexKnowledgeFiles,
  useIndexPendingKnowledgeFiles,
  useMoveKnowledgeFile,
  useParseKnowledgeFiles,
  useParsePendingKnowledgeFiles,
  useRenameKnowledgeFolder,
  useRepairKnowledgeStats,
} from './knowledge-queries';

/** 本面板全部写操作的通知标题。 */
const NOTIFY_TITLE = '文件';

/** 批量删除的分批大小：避免一次请求里塞进整页文件。 */
const BATCH_DELETE_CHUNK_SIZE = 50;

export type FileActionsOptions = {
  kbId: string;
  /** 只读知识库：写入口在界面上已经不渲染，门禁仍在这里兜一层。 */
  readOnly: boolean;
  /** 当前页的行与选择：批量动作与按钮可用性都由它们派生。 */
  items: KnowledgeFileItem[];
  selectedIds: string[];
  /** 表里还是上一个目录的行（`keepPreviousData` 期间）：不能对它们动手。 */
  stale: boolean;
  /** 状态筛选态：跨目录查询，移动没有确定语义。 */
  filtered: boolean;
  /** 处在虚拟目录层：同上。 */
  virtualPath: boolean;
  /** 批量动作提交后清空选择，由表格提供。 */
  clearSelection: () => void;
};

export type FileActions = {
  /** 有写操作在飞行中：行内入口与拖拽先关掉。 */
  locked: boolean;
  /** 拖拽移动是否可用（只读 / 锁定 / 筛选态 / 虚拟层任一成立即否）。 */
  canMutate: boolean;
  /** 待解析 / 待入库批量入口在飞行中。 */
  batchBusy: boolean;
  /** 统计修复在飞行中。 */
  repairing: boolean;
  /** 文件夹新建 / 重命名在飞行中。 */
  folderBusy: boolean;
  /** 批量条三个入口的可用性：锁定或选中里没有对应能力的行为即 false。 */
  canBatchParse: boolean;
  canBatchIndex: boolean;
  canBatchDelete: boolean;
  /** 原始通知出口：虚拟文件夹弹窗自己组装文案时用。 */
  notify: (input: NotificationInput) => void;
  notifyDone: (message: string) => void;
  notifyError: (error: unknown, fallback?: string) => void;
  download: (file: KnowledgeFileItem) => Promise<void>;
  submitTask: (
    kind: 'parse' | 'index',
    file: KnowledgeFileItem,
  ) => Promise<void>;
  deleteOne: (file: KnowledgeFileItem) => Promise<void>;
  moveOne: (
    file: KnowledgeFileItem | null,
    targetFolderId: string | null,
  ) => Promise<void>;
  /** 返回是否提交成功，调用方据此决定关不关弹窗。 */
  createFolder: (
    folderName: string,
    parentId: string | null,
  ) => Promise<boolean>;
  renameFolder: (
    file: KnowledgeFileItem,
    folderName: string,
  ) => Promise<boolean>;
  batchTask: (kind: 'parse' | 'index') => Promise<void>;
  batchDelete: () => Promise<void>;
  parsePending: () => Promise<void>;
  indexPending: () => Promise<void>;
  repairStats: () => Promise<void>;
};

export const useFileActions = ({
  kbId,
  readOnly,
  items,
  selectedIds,
  stale,
  filtered,
  virtualPath,
  clearSelection,
}: FileActionsOptions): FileActions => {
  const { confirm } = useConfirm();
  const { addNotification } = useNotifications();

  const removeOne = useDeleteKnowledgeFile(kbId);
  const removeMany = useDeleteKnowledgeFiles(kbId);
  const parseFiles = useParseKnowledgeFiles(kbId);
  const indexFiles = useIndexKnowledgeFiles(kbId);
  const moveFile = useMoveKnowledgeFile(kbId);
  const createFolderMutation = useCreateKnowledgeFolder(kbId);
  const renameFolderMutation = useRenameKnowledgeFolder(kbId);
  const parsePendingMutation = useParsePendingKnowledgeFiles(kbId);
  const indexPendingMutation = useIndexPendingKnowledgeFiles(kbId);
  const repairStatsMutation = useRepairKnowledgeStats(kbId);

  const notifyDone = React.useCallback(
    (message: string) =>
      addNotification({ type: 'success', title: NOTIFY_TITLE, message }),
    [addNotification],
  );
  const notifyError = React.useCallback(
    (error: unknown, fallback = '操作失败。') =>
      addNotification({
        type: 'error',
        title: NOTIFY_TITLE,
        message: asText(error, fallback),
      }),
    [addNotification],
  );
  const notifyWarning = React.useCallback(
    (message: string) =>
      addNotification({ type: 'warning', title: NOTIFY_TITLE, message }),
    [addNotification],
  );

  const locked =
    removeOne.isPending ||
    removeMany.isPending ||
    parseFiles.isPending ||
    indexFiles.isPending ||
    createFolderMutation.isPending ||
    renameFolderMutation.isPending ||
    parsePendingMutation.isPending ||
    indexPendingMutation.isPending;

  const canMutate = canMutateKnowledgeFiles({
    readOnly,
    locked: locked || stale,
    filtered,
    virtualPath,
  });

  /** 选中的行里满足谓词的那些：批量动作只提交它们，其余跳过。 */
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedWith = React.useCallback(
    (predicate: (file: KnowledgeFileItem) => boolean) =>
      items.filter((item) => selectedSet.has(item.file_id) && predicate(item)),
    [items, selectedSet],
  );

  const canBatchParse = !locked && selectedWith(canParseFile).length > 0;
  const canBatchIndex = !locked && selectedWith(canIndexFile).length > 0;
  const canBatchDelete = !locked && selectedWith(canDeleteFile).length > 0;

  /** 下载原始文件：文件名优先用响应头里的，取不到退回行上的展示名。 */
  const download = React.useCallback(
    async (file: KnowledgeFileItem) => {
      try {
        const { blob, filename } = await knowledgeApi.downloadDocument(
          kbId,
          file.file_id,
        );
        triggerBlobDownload(blob, filename ?? file.filename);
      } catch (error) {
        notifyError(error, '下载失败。');
      }
    },
    [kbId, notifyError],
  );

  /** 提交解析或入库；后端受理的是任务，列表状态稍后才变。 */
  const submitTask = React.useCallback(
    async (kind: 'parse' | 'index', file: KnowledgeFileItem) => {
      try {
        if (kind === 'parse') {
          await parseFiles.mutateAsync([file.file_id]);
        } else {
          await indexFiles.mutateAsync([file.file_id]);
        }
        notifyDone(kind === 'parse' ? '已提交解析。' : '已提交入库。');
      } catch (error) {
        notifyError(
          error,
          kind === 'parse' ? '提交解析失败。' : '提交入库失败。',
        );
      }
    },
    [indexFiles, notifyDone, notifyError, parseFiles],
  );

  /** 删除：目录连内容一起删，两种确认文案由参照给出。 */
  const deleteOne = React.useCallback(
    async (file: KnowledgeFileItem) => {
      const confirmed = await confirm(
        file.is_folder
          ? {
              title: '删除文件夹',
              description: `确定要删除文件夹「${file.filename}」及其包含的所有内容吗？`,
              confirmText: '确认',
              destructive: true,
            }
          : {
              title: '删除文件',
              description: '确定要删除该文件吗？',
              confirmText: '确认',
              destructive: true,
            },
      );
      if (!confirmed) return;
      try {
        await removeOne.mutateAsync(file.file_id);
        notifyDone('删除成功。');
      } catch (error) {
        notifyError(error, '删除文件失败。');
      }
    },
    [confirm, notifyDone, notifyError, removeOne],
  );

  const moveOne = React.useCallback(
    async (file: KnowledgeFileItem | null, targetFolderId: string | null) => {
      if (!file || file.is_virtual_folder || !canMutate) return;
      try {
        await moveFile.mutateAsync({
          fileId: file.file_id,
          newParentId: targetFolderId,
        });
        notifyDone(`已将「${file.filename}」移动到目标文件夹`);
      } catch (error) {
        notifyError(error, '移动失败');
      }
    },
    [canMutate, moveFile, notifyDone, notifyError],
  );

  const createFolder = React.useCallback(
    async (folderName: string, parentId: string | null) => {
      if (!folderName) {
        notifyWarning('请输入文件夹名称');
        return false;
      }
      try {
        await createFolderMutation.mutateAsync({ folderName, parentId });
        notifyDone('创建成功');
        return true;
      } catch (error) {
        notifyError(error);
        return false;
      }
    },
    [createFolderMutation, notifyDone, notifyError, notifyWarning],
  );

  const renameFolder = React.useCallback(
    async (file: KnowledgeFileItem, folderName: string) => {
      if (!folderName) {
        notifyWarning('请输入文件夹名称');
        return false;
      }
      try {
        await renameFolderMutation.mutateAsync({
          folderId: file.file_id,
          folderName,
        });
        notifyDone('重命名成功');
        return true;
      } catch (error) {
        notifyError(error);
        return false;
      }
    },
    [notifyDone, notifyError, notifyWarning, renameFolderMutation],
  );

  /** 批量解析 / 入库：只提交可解析（可入库）的行，其余跳过。 */
  const batchTask = React.useCallback(
    async (kind: 'parse' | 'index') => {
      const valid = selectedWith(
        kind === 'parse' ? canParseFile : canIndexFile,
      );
      if (valid.length === 0) {
        notifyWarning(
          kind === 'parse' ? '没有可解析的文件。' : '没有可入库的文件。',
        );
        return;
      }
      try {
        const ids = valid.map((item) => item.file_id);
        if (kind === 'parse') {
          await parseFiles.mutateAsync(ids);
        } else {
          await indexFiles.mutateAsync(ids);
        }
        notifyDone(
          kind === 'parse'
            ? `已提交 ${ids.length} 个文件解析。`
            : `已提交 ${ids.length} 个文件入库。`,
        );
        clearSelection();
      } catch (error) {
        notifyError(
          error,
          kind === 'parse' ? '提交解析失败。' : '提交入库失败。',
        );
      }
    },
    [
      clearSelection,
      indexFiles,
      notifyDone,
      notifyError,
      notifyWarning,
      parseFiles,
      selectedWith,
    ],
  );

  /**
   * 批量删除：先确认数量，只提交可删除的行（解析 / 入库进行中的会被跳过），
   * 再按 50 个一批提交，单批失败不中断其余批次。
   */
  const batchDelete = React.useCallback(async () => {
    const valid = selectedWith(canDeleteFile);
    if (valid.length === 0) {
      notifyWarning('没有可删除的文件。');
      return;
    }
    // 只报当前页能看到的选中行，避免拿已被后台刷新掉的 id 撑大数字
    const skipped =
      items.filter((item) => selectedSet.has(item.file_id)).length -
      valid.length;
    const confirmed = await confirm({
      title: '批量删除文件',
      description: `确定要删除选中的 ${valid.length} 个文件吗？${
        skipped > 0 ? `另有 ${skipped} 个处理中的文件会被跳过。` : ''
      }`,
      confirmText: '确认',
      destructive: true,
    });
    if (!confirmed) return;

    const ids = valid.map((item) => item.file_id);
    let deleted = 0;
    let failed = 0;
    for (let index = 0; index < ids.length; index += BATCH_DELETE_CHUNK_SIZE) {
      const chunk = ids.slice(index, index + BATCH_DELETE_CHUNK_SIZE);
      try {
        const result = await removeMany.mutateAsync(chunk);
        deleted += result.deleted_count ?? 0;
        failed += result.failed_items?.length ?? 0;
      } catch {
        failed += chunk.length;
      }
    }
    clearSelection();
    if (failed === 0) {
      notifyDone(`成功删除 ${deleted} 个文件。`);
      return;
    }
    if (deleted > 0) {
      notifyWarning(`成功删除 ${deleted} 个文件，${failed} 个文件删除失败。`);
      return;
    }
    notifyError(`${failed} 个文件删除失败。`);
  }, [
    clearSelection,
    confirm,
    items,
    notifyDone,
    notifyError,
    notifyWarning,
    removeMany,
    selectedSet,
    selectedWith,
  ]);

  /** 面板首行的两个批量入口：整库范围，不看当前目录与选择。 */
  const parsePending = React.useCallback(async () => {
    try {
      await parsePendingMutation.mutateAsync({});
      notifyDone('已提交待解析文件。');
    } catch (error) {
      notifyError(error);
    }
  }, [notifyDone, notifyError, parsePendingMutation]);

  const indexPending = React.useCallback(async () => {
    try {
      await indexPendingMutation.mutateAsync({});
      notifyDone('已提交待入库文件。');
    } catch (error) {
      notifyError(error);
    }
  }, [indexPendingMutation, notifyDone, notifyError]);

  const repairStats = React.useCallback(async () => {
    try {
      const result = await repairStatsMutation.mutateAsync();
      const repaired = result.updated_chunk_files + result.updated_token_files;
      addNotification({
        type: 'success',
        title: NOTIFY_TITLE,
        message:
          repaired > 0
            ? `已修复 ${result.updated_token_files} 个 Token 统计，${result.updated_chunk_files} 个 Chunk 统计`
            : '统计已是最新',
      });
    } catch (error) {
      notifyError(error);
    }
  }, [addNotification, notifyError, repairStatsMutation]);

  return {
    locked,
    canMutate,
    batchBusy: parsePendingMutation.isPending || indexPendingMutation.isPending,
    repairing: repairStatsMutation.isPending,
    folderBusy:
      createFolderMutation.isPending || renameFolderMutation.isPending,
    canBatchParse,
    canBatchIndex,
    canBatchDelete,
    notify: addNotification,
    notifyDone,
    notifyError,
    download,
    submitTask,
    deleteOne,
    moveOne,
    createFolder,
    renameFolder,
    batchTask,
    batchDelete,
    parsePending,
    indexPending,
    repairStats,
  };
};
