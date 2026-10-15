/**
 * 导航列底部的任务中心入口与面板。
 *
 * 入口只对管理员渲染（后端任务端点用 `get_admin_user` 兜底）；折叠态只有 39px
 * 内容宽，放不下 28px 的角标按钮，与参照同样隐藏。列表查询挂在这里而不是面板里：
 * 面板关着的时候角标也要跟着任务状态更新。
 */
import { Badge, Tooltip } from 'antd';
import { ClipboardList } from 'lucide-react';
import * as React from 'react';

import { useIsAdmin } from '@/entities/session';

import { EMPTY_TASK_SUMMARY } from '../api/task-center-api';
import { countActiveTasks } from '../lib/task-status';
import { useTaskActions } from '../model/use-task-actions';
import { useTasks } from '../model/task-center-queries';
import { TaskCenterModal } from './task-center-modal';
import styles from './task-center.module.css';

type TaskCenterProps = {
  /** 折叠态不渲染入口，也不轮询。 */
  collapsed: boolean;
};

export const TaskCenter = ({ collapsed }: TaskCenterProps) => {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = React.useState(false);
  const visible = isAdmin && !collapsed;
  const tasks = useTasks({ enabled: visible, focused: open });
  const actions = useTaskActions();

  if (!visible) return null;

  const summary = tasks.data?.summary ?? EMPTY_TASK_SUMMARY;
  const activeCount = countActiveTasks(summary.status_counts);

  return (
    <>
      <Tooltip title="任务中心" placement="top">
        <button
          type="button"
          className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
          aria-label={
            activeCount > 0 ? `任务中心，${activeCount} 个进行中` : '任务中心'
          }
          aria-expanded={open}
          onClick={() => {
            setOpen(true);
            // 面板打开即取一次最新状态：低频兜底最慢要等 12 秒，手动打开不该等
            void tasks.refetch();
          }}
        >
          <Badge count={activeCount} size="small" overflowCount={99}>
            <ClipboardList className={styles.triggerIcon} aria-hidden />
          </Badge>
        </button>
      </Tooltip>

      <TaskCenterModal
        open={open}
        onOpenChange={setOpen}
        tasks={tasks.data?.tasks ?? []}
        summary={summary}
        refreshing={tasks.isFetching}
        error={tasks.error}
        onRefresh={() => void tasks.refetch()}
        actions={actions}
      />
    </>
  );
};
