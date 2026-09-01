import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/dialog';
import { useNotifications } from '@/components/ui/notifications';

import { useDeleteKnowledgeBase } from '../api/knowledge-bases';

type DeleteKnowledgeBaseProps = {
  kbName: string;
};

export function DeleteKnowledgeBase({ kbName }: DeleteKnowledgeBaseProps) {
  const { addNotification } = useNotifications();
  const deleteMutation = useDeleteKnowledgeBase({
    mutationConfig: {
      onSuccess: () => {
        addNotification({
          type: 'success',
          title: '知识库已删除',
          message: kbName,
        });
      },
    },
  });

  return (
    <ConfirmationDialog
      icon="danger"
      title="删除知识库"
      body="该操作会彻底清空知识库（向量、文档登记、去重记录），且不可恢复。确定删除吗？"
      triggerButton={
        <Button variant="destructive" size="sm">
          删除
        </Button>
      }
      confirmButton={
        <Button
          disabled={deleteMutation.isPending}
          type="button"
          variant="destructive"
          onClick={() => deleteMutation.mutate(kbName)}
        >
          确认删除
        </Button>
      }
    />
  );
}
