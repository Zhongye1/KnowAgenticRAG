import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNotifications } from '@/components/ui/notifications';

import { useDeleteKnowledgeBase } from '../../api/knowledge-bases';

type DeleteKnowledgeBaseProps = {
  kbName: string;
  displayName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DeleteKnowledgeBase({
  kbName,
  displayName,
  open,
  onOpenChange,
}: DeleteKnowledgeBaseProps) {
  const { addNotification } = useNotifications();
  const deleteMutation = useDeleteKnowledgeBase({
    mutationConfig: {
      onSuccess: () => {
        onOpenChange(false);
        addNotification({
          type: 'success',
          title: '知识库已删除',
          message: displayName || kbName,
        });
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
