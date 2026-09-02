import { TrashSimple } from '@phosphor-icons/react';
import { useState } from 'react';

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
import { useNotifications } from '@/components/ui/notifications';

import { useDeleteKnowledgeBase } from '../api/knowledge-bases';

type DeleteKnowledgeBaseProps = {
  kbName: string;
  displayName?: string;
};

export function DeleteKnowledgeBase({
  kbName,
  displayName,
}: DeleteKnowledgeBaseProps) {
  const [open, setOpen] = useState(false);
  const { addNotification } = useNotifications();
  const deleteMutation = useDeleteKnowledgeBase({
    mutationConfig: {
      onSuccess: () => {
        setOpen(false);
        addNotification({
          type: 'success',
          title: '知识库已删除',
          message: displayName || kbName,
        });
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`删除知识库 ${displayName || kbName}`}
          title="删除知识库"
        >
          <TrashSimple />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除知识库</DialogTitle>
          <DialogDescription>
            该操作会彻底清空知识库（向量、文档登记、去重记录），且不可恢复。确定删除吗？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              取消
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate({ kb_name: kbName })}
          >
            {deleteMutation.isPending ? '删除中…' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
