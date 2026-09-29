import { FolderPlus, Folder as FolderIcon, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useNotifications } from '@/components/ui/notifications';
import type { FolderTreeNode } from '@/generated/types';

import {
  ROOT_FOLDER_KEY,
  useCreateFolder,
  useDeleteFolder,
  useFolderTree,
  useUpdateFolder,
} from '../../api/folders';
import { FolderTree, type TreeNode } from './folder-tree';

/**
 * 知识库文件夹面板（参考 Yuxi 前端契约的树 + 本项目的增删改）。
 *
 * 与 Yuxi 的差异（有意）：Yuxi 的树混装「文件夹 + 文档」两类节点；本项目**树只放文件夹**，
 * 文档留在右侧分页表格里。原因是文档列表要过 ACL 可见集与分页器（`documents.py:99`），
 * 把它内联进树会同时破坏两者——过滤用「选中文件夹 → 传 folder_id」表达。
 */

const toTreeNodes = (nodes: FolderTreeNode[]): TreeNode[] =>
  nodes.map((node) => ({
    key: node.folder_id,
    title: node.document_count
      ? `${node.name} (${node.document_count})`
      : node.name,
    isLeaf: false,
    children: node.children?.length ? toTreeNodes(node.children) : undefined,
  }));

export function FolderPanel({
  kbName,
  selectedKey,
  onSelect,
}: {
  kbName: string;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const { addNotification } = useNotifications();
  const tree = useFolderTree(kbName);
  const [pendingParent, setPendingParent] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const createFolder = useCreateFolder({
    kbName,
    mutationConfig: {
      onSuccess: () => {
        setPendingParent(null);
        setDraft('');
        addNotification({ type: 'success', title: '文件夹已创建' });
      },
    },
  });
  const updateFolder = useUpdateFolder({
    kbName,
    mutationConfig: {
      onSuccess: () => {
        setRenaming(null);
        setDraft('');
        addNotification({ type: 'success', title: '已重命名' });
      },
    },
  });
  const deleteFolder = useDeleteFolder({
    kbName,
    mutationConfig: {
      onSuccess: () => {
        addNotification({
          type: 'success',
          title: '文件夹已删除',
          message: '其中的子文件夹与文档已上浮到父级',
        });
      },
    },
  });

  // 根目录是哨兵节点：后端用 `folder_id IS NULL` 表达根，前端用 __root__ 表示
  const nodes = useMemo<TreeNode[]>(
    () => [
      {
        key: ROOT_FOLDER_KEY,
        title: tree.data?.length ? '根目录' : '根目录（暂无文件夹）',
        isLeaf: false,
        children: toTreeNodes(tree.data ?? []),
      },
    ],
    [tree.data],
  );

  const submitDraft = (parentId: string | null) => {
    const name = draft.trim();
    if (!name) return;
    createFolder.mutate({
      kb_name: kbName,
      data: {
        name,
        parent_id: parentId === ROOT_FOLDER_KEY ? null : parentId,
        sort_order: 0,
      },
    });
  };

  if (tree.isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner className="size-4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-muted-foreground">目录</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="在根目录新建文件夹"
          title="在根目录新建文件夹"
          onClick={() => {
            setPendingParent(ROOT_FOLDER_KEY);
            setRenaming(null);
            setDraft('');
          }}
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </div>

      {pendingParent !== null ? (
        <div className="flex items-center gap-1 px-1">
          <input
            autoFocus
            className="h-7 min-w-0 flex-1 rounded-medium border border-color-border-2 bg-color-bg-1 px-1.5 text-[11px] outline-none focus:border-color-border-1"
            placeholder="文件夹名"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitDraft(pendingParent);
              if (event.key === 'Escape') setPendingParent(null);
            }}
          />
          <Button
            size="sm"
            disabled={!draft.trim() || createFolder.isPending}
            onClick={() => submitDraft(pendingParent)}
          >
            建
          </Button>
        </div>
      ) : null}

      <FolderTree
        treeData={nodes}
        selectedKey={selectedKey}
        defaultExpandedKeys={[ROOT_FOLDER_KEY]}
        onSelect={(key) => onSelect(key)}
        renderIcon={() => (
          <FolderIcon className="size-3.5 shrink-0 opacity-70" />
        )}
        renderTitle={(node) =>
          renaming === node.key ? (
            <input
              autoFocus
              className="h-6 w-full rounded-medium border border-color-border-2 bg-color-bg-1 px-1 text-[11px] outline-none"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => setRenaming(null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && draft.trim()) {
                  updateFolder.mutate({
                    kb_name: kbName,
                    folder_id: node.key,
                    data: { name: draft.trim() },
                  });
                }
                if (event.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            node.title
          )
        }
        renderActions={(node) =>
          node.key === ROOT_FOLDER_KEY ? null : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="新建子目录"
                title="新建子目录"
                onClick={() => {
                  setPendingParent(node.key);
                  setRenaming(null);
                  setDraft('');
                }}
              >
                <FolderPlus className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="重命名"
                title="重命名"
                onClick={() => {
                  setRenaming(node.key);
                  setDraft(node.title.replace(/\s*\(\d+\)$/, ''));
                }}
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="删除文件夹"
                title="删除（子项上浮到父级）"
                onClick={() =>
                  deleteFolder.mutate({ kb_name: kbName, folder_id: node.key })
                }
              >
                <Trash2 className="size-3" />
              </Button>
            </>
          )
        }
      />
    </div>
  );
}
