/**
 * 任务中心的写操作编排：mutation、二次确认、通知文案与缓存失效都归这里，组件只接回调。
 *
 * 取消是「请求受理」而不是「已取消」：后端只记下 `cancel_requested`，worker 要在当前
 * 步骤的取消点让出控制权，因此文案写「取消请求已提交」，随后重取列表而不是本地改状态。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { describeFailure } from '@/shared/api';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useNotifications } from '@/shared/ui/notifications';

import { taskCenterApi } from '../api/task-center-api';
import { taskKeys } from './task-center-queries';

const NOTIFY_TITLE = '任务中心';

export const useTaskActions = () => {
  const queryClient = useQueryClient();
  const { confirm } = useConfirm();
  const { addNotification } = useNotifications();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: taskKeys.all });

  const cancel = useMutation({
    mutationFn: (taskId: string) => taskCenterApi.cancel(taskId),
    onSuccess: async () => {
      addNotification({
        type: 'success',
        title: NOTIFY_TITLE,
        message: '取消请求已提交，任务会在当前步骤结束后停止。',
      });
      await invalidate();
    },
    onError: (error) =>
      addNotification({
        type: 'error',
        title: NOTIFY_TITLE,
        message: describeFailure(error, '取消任务失败。'),
      }),
  });

  const remove = useMutation({
    mutationFn: (taskId: string) => taskCenterApi.remove(taskId),
    onSuccess: async () => {
      addNotification({
        type: 'success',
        title: NOTIFY_TITLE,
        message: '任务记录已删除。',
      });
      await invalidate();
    },
    onError: (error) =>
      addNotification({
        type: 'error',
        title: NOTIFY_TITLE,
        message: describeFailure(error, '删除任务失败。'),
      }),
  });

  return {
    cancel: (taskId: string) => cancel.mutate(taskId),
    cancelPending: cancel.isPending,
    /** 删除不可恢复，先二次确认；确认后才发请求。 */
    remove: async (task: { id: string; name: string }) => {
      const confirmed = await confirm({
        title: '删除任务记录',
        description: `删除后「${task.name}」不再出现在任务中心，此操作不可恢复。执行中的任务请先取消。`,
        confirmText: '删除',
        destructive: true,
      });
      if (confirmed) remove.mutate(task.id);
    },
    removePending: remove.isPending,
  };
};
