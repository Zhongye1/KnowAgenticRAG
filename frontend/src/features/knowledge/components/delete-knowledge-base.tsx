import { TrashSimple } from '@phosphor-icons/react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/dialog';
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
  const [isDone, setIsDone] = useState(false);
  const { addNotification } = useNotifications();
  const deleteMutation = useDeleteKnowledgeBase({
    mutationConfig: {
      onSuccess: () => {
        setIsDone(true);
        addNotification({
          type: 'success',
          title: '知识库已删除',
          message: displayName || kbName,
        });
      },
    },
  });

  return (
    <ConfirmationDialog
      icon="danger"
      title="删除知识库"
      body="该操作会彻底清空知识库（向量、文档登记、去重记录），且不可恢复。确定删除吗？"
      isDone={isDone}
      cancelButtonText="取消"
      triggerButton={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`删除知识库 ${displayName || kbName}`}
          title="删除知识库"
          onClick={() => setIsDone(false)}
        >
          <TrashSimple />
        </Button>
      }
      confirmButton={
        <Button
          disabled={deleteMutation.isPending}
          type="button"
          variant="destructive"
          onClick={() => deleteMutation.mutate({ kb_name: kbName })}
        >
          确认删除
        </Button>
      }
    />
  );
}
