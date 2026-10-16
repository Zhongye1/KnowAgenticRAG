/**
 * 「移动到…」弹窗。
 *
 * 目录树用列表接口逐层取，不额外拉全量树。候选只含**实体**目录：移动接口 `PUT …/documents/
 * {doc_id}/move` 写的是 `parent_id`，虚拟目录只是文件名里路径的投影、没有实体记录，选它只会把
 * 文件移到它的父目录（表现为「提示移动成功但什么都没变」）；被移动的目录自己与目录名里带 `/`
 * 的实体目录也选不到。目标与当前位置相同时不给确认（后端是幂等更新，会返回成功但什么都没变）。
 */
import * as React from 'react';
import { ChevronRight, Folder, Home } from 'lucide-react';
import { Button, Empty, Modal, Spin } from 'antd';

import type { KnowledgeFileItem } from '../../../api/knowledge-api';
import {
  useKnowledgeFiles,
  useMoveKnowledgeFile,
} from '../../../model/knowledge-queries';

type MoveFileDialogProps = {
  kbId: string;
  /** 要移动的文件或目录；弹窗由表格按需挂载，因此这里一定有值。 */
  file: KnowledgeFileItem;
  onOpenChange: (open: boolean) => void;
  onMoved?: (file: KnowledgeFileItem) => void;
  onError?: (message: string) => void;
};

type MoveTarget = { parentId: string | null; label: string };

const ROOT_TARGET: MoveTarget = { parentId: null, label: '根目录' };

export const MoveFileDialog = ({
  kbId,
  file,
  onOpenChange,
  onMoved,
  onError,
}: MoveFileDialogProps) => {
  const [target, setTarget] = React.useState<MoveTarget>(ROOT_TARGET);
  const [crumbs, setCrumbs] = React.useState<MoveTarget[]>([]);
  const moveMutation = useMoveKnowledgeFile(kbId);

  const listing = useKnowledgeFiles(kbId, {
    parentId: target.parentId,
    pathPrefix: '',
    status: 'all',
    page: 1,
    pageSize: 100,
  });
  // 候选：实体目录，且不是被移动的目录自己
  const folders = (listing.data?.items ?? []).filter(
    (item) =>
      item.is_folder &&
      !item.is_virtual_folder &&
      item.file_id !== file.file_id,
  );
  // 目标就是当前位置时移动没有意义：后端会返回成功，但什么都没变
  const atCurrentParent = target.parentId === (file.parent_id ?? null);

  const enter = (folder: KnowledgeFileItem) => {
    const next: MoveTarget = {
      parentId: folder.file_id,
      label: folder.filename,
    };
    setCrumbs((current) => [...current, next]);
    setTarget(next);
  };

  const gotoCrumb = (index: number) => {
    if (index < 0) {
      setCrumbs([]);
      setTarget(ROOT_TARGET);
      return;
    }
    const next = crumbs[index];
    setCrumbs((current) => current.slice(0, index + 1));
    setTarget(next);
  };

  const onConfirm = async () => {
    try {
      await moveMutation.mutateAsync({
        fileId: file.file_id,
        newParentId: target.parentId,
      });
      onMoved?.(file);
      onOpenChange(false);
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : '移动失败，请稍后重试。',
      );
    }
  };

  return (
    <Modal
      open
      onCancel={() => onOpenChange(false)}
      footer={null}
      data-testid="move-file-dialog"
      title={
        <div>
          <div>移动「{file.filename}」</div>
          <div className="text-xs font-normal text-color-text-3">
            选择目标目录，确认后移动；当前浏览的是「{target.label}
            」。只列出实体目录：
            路径投影出来的目录没有独立记录，不能作为移动目标。
          </div>
        </div>
      }
    >
      <nav
        className="flex flex-wrap items-center gap-1 text-xs text-color-text-3"
        aria-label="目标目录路径"
      >
        <Button
          htmlType="button"
          variant="text"
          size="small"
          aria-label="回到根目录"
          onClick={() => gotoCrumb(-1)}
        >
          <Home className="size-3" aria-hidden />
          根目录
        </Button>
        {crumbs.map((crumb, index) => (
          <React.Fragment key={`${crumb.parentId ?? 'root'}-${index}`}>
            <ChevronRight className="size-3 shrink-0" aria-hidden />
            <button
              type="button"
              className="max-w-40 truncate border-0 bg-transparent p-0 hover:text-color-text-1"
              title={crumb.label}
              onClick={() => gotoCrumb(index)}
            >
              {crumb.label}
            </button>
          </React.Fragment>
        ))}
      </nav>
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-large border border-color-border-1 p-1">
        {listing.isPending ? (
          <div className="flex items-center gap-2 p-3 text-xs text-color-text-3">
            <Spin aria-hidden className="size-4" />
            正在加载目录…
          </div>
        ) : null}
        {listing.isError ? (
          <p role="alert" className="p-3 text-xs text-danger-6">
            {listing.error instanceof Error
              ? listing.error.message
              : '加载目录失败。'}
          </p>
        ) : null}
        {listing.isSuccess && folders.length === 0 ? (
          <Empty description="这个目录下没有子目录" />
        ) : null}
        {folders.map((folder) => (
          <button
            key={folder.file_id}
            type="button"
            className="flex items-center gap-2 rounded-medium border-0 bg-transparent px-2 py-2 text-left text-sm text-color-text-1 hover:bg-sidebar-accent"
            onClick={() => enter(folder)}
          >
            <Folder className="size-4 shrink-0 text-color-text-3" aria-hidden />
            <span className="min-w-0 flex-1 truncate" title={folder.filename}>
              {folder.filename}
            </span>
            <ChevronRight className="size-3 shrink-0" aria-hidden />
          </button>
        ))}
      </div>
      <div>
        <Button
          htmlType="button"
          variant="outlined"
          onClick={() => onOpenChange(false)}
        >
          取消
        </Button>
        <Button
          htmlType="button"
          disabled={moveMutation.isPending || atCurrentParent}
          onClick={() => void onConfirm()}
        >
          {moveMutation.isPending
            ? '移动中…'
            : atCurrentParent
              ? '已经在这个目录下'
              : `移动到「${target.label}」`}
        </Button>
      </div>
    </Modal>
  );
};
