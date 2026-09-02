import { PencilSimple, TrashSimple, UploadSimple } from '@phosphor-icons/react';
import { useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/form';
import { useNotifications } from '@/components/ui/notifications';

import {
  useDeleteDocument,
  useReplaceDocumentFile,
  useUpdateDocument,
} from '../../api/documents';
import type { DocumentItem } from '../../api/types';

type DocumentActionsProps = {
  kbName: string;
  doc: DocumentItem;
};

export function DocumentActions({ kbName, doc }: DocumentActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(doc.name);
  const { addNotification } = useNotifications();

  const renameMutation = useUpdateDocument({
    mutationConfig: {
      onSuccess: (data) => {
        addNotification({
          type: 'success',
          title: '文档已重命名',
          message: data.name,
        });
        setRenameOpen(false);
      },
    },
  });

  const replaceMutation = useReplaceDocumentFile({
    mutationConfig: {
      onSuccess: (data) => {
        addNotification({
          type: 'success',
          title: '文件已替换',
          message: data.name,
        });
      },
      onError: () => {
        addNotification({
          type: 'error',
          title: '替换失败',
          message: '请检查新文件是否与其他文档重复',
        });
      },
    },
  });

  const deleteMutation = useDeleteDocument({
    mutationConfig: {
      onSuccess: () => {
        addNotification({
          type: 'success',
          title: '文档已删除',
          message: doc.name,
        });
      },
    },
  });

  const handleReplaceFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      replaceMutation.mutate({
        kbName,
        documentId: doc.document_id,
        file,
      });
    }
    event.target.value = '';
  };

  const handleRename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === doc.name) {
      setRenameOpen(false);
      return;
    }
    renameMutation.mutate({
      kbName,
      documentId: doc.document_id,
      name: trimmed,
    });
  };

  return (
    <div className="flex items-center gap-1">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleReplaceFile}
      />
      <Button
        variant="ghost"
        size="sm"
        title="替换文件"
        disabled={replaceMutation.isPending}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadSimple className="size-4" />
      </Button>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" title="重命名">
            <PencilSimple className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名文档</DialogTitle>
            <DialogDescription>
              {doc.document_id} · 仅更新名称，不改变文件内容
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="doc-name">文档名称</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                取消
              </Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={renameMutation.isPending}
              onClick={handleRename}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button
        variant="ghost"
        size="sm"
        title="删除文档"
        disabled={deleteMutation.isPending}
        onClick={() =>
          deleteMutation.mutate({
            kbName,
            documentId: doc.document_id,
          })
        }
      >
        <TrashSimple className="size-4" />
      </Button>
    </div>
  );
}
