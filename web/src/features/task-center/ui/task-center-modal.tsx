/**
 * 任务中心弹窗：后台作业的只读进度面板。
 *
 * 档位计数取后端汇总（覆盖全部任务），列表只有最近 100 条，因此计数可能大于可见条数。
 * 展示的是作业本身的状态：取消与删除都在这里发起，「已完成」只表示执行结束，
 * 不代表过程中没有失败的分块——这句提醒常驻在顶部。
 */
import { Alert, Modal } from 'antd';
import * as React from 'react';

import { describeFailure } from '@/shared/api';
import { Empty as SharedEmpty } from '@/shared/ui/empty';
import {
  FilterGroup,
  type FilterOption,
} from '@/shared/ui/filter-group';
import { ListRefreshButton } from '@/shared/ui/list-toolbar';

import type { TaskListSummary, TaskSummary } from '../api/task-center-api';
import { TASK_LIST_LIMIT } from '../api/task-center-api';
import {
  countActiveTasks,
  countFailedTasks,
  filterTasks,
  taskListHint,
  type TaskFilter,
} from '../lib/task-status';
import type { useTaskActions } from '../model/use-task-actions';
import { TaskCard } from './task-card';
import { TaskDetailModal } from './task-detail-modal';
import styles from './task-center.module.css';

type TaskCenterModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 已加载的任务，按创建时间倒序（后端排好）。 */
  tasks: readonly TaskSummary[];
  /** 后端汇总；列表为空时也有值。 */
  summary: TaskListSummary;
  refreshing: boolean;
  /** 取列表失败的原始错误，由 `describeFailure` 折成文案。 */
  error: unknown;
  onRefresh: () => void;
  actions: ReturnType<typeof useTaskActions>;
};

export const TaskCenterModal = ({
  open,
  onOpenChange,
  tasks,
  summary,
  refreshing,
  error,
  onRefresh,
  actions,
}: TaskCenterModalProps) => {
  const [filter, setFilter] = React.useState<TaskFilter>('all');
  const [detailTaskId, setDetailTaskId] = React.useState<string | null>(null);

  // 详情是嵌套弹窗：它自己不会跟着外层关闭，关闭出口统一在这里清掉选中项
  const close = () => {
    setDetailTaskId(null);
    onOpenChange(false);
  };
  const detailTask = tasks.find((task) => task.id === detailTaskId) ?? null;
  const visible = filterTasks(tasks, filter);
  const filterOptions = React.useMemo<ReadonlyArray<FilterOption<TaskFilter>>>(
    () => [
      { value: 'all', label: `全部 ${summary.total}` },
      { value: 'active', label: `进行中 ${countActiveTasks(summary.status_counts)}` },
      { value: 'success', label: `已完成 ${summary.status_counts.success ?? 0}` },
      { value: 'failed', label: `失败 ${countFailedTasks(summary.status_counts)}` },
    ],
    [summary],
  );

  return (
    <Modal open={open} title="任务中心" width={680} footer={null} onCancel={close}>
      <div className={styles.panel}>
        <Alert
          type="info"
          showIcon
          message="「已完成」只表示任务执行结束，过程中仍可能留有失败的文件或分块，请结合任务描述与日志判断最终结果。"
        />
        <div className={styles.toolbar}>
          <FilterGroup
            label="任务筛选"
            value={filter}
            options={filterOptions}
            onChange={setFilter}
          />
          <div className={styles.toolbarActions}>
            <ListRefreshButton
              label="刷新任务列表"
              refreshing={refreshing}
              onClick={onRefresh}
            />
          </div>
        </div>

        {error ? (
          <Alert
            type="error"
            showIcon
            message={describeFailure(error, '任务列表加载失败。')}
          />
        ) : null}

        {visible.length ? (
          <div className={styles.list}>
            {visible.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpenDetail={(task) => setDetailTaskId(task.id)}
                onCancel={actions.cancel}
                onDelete={(item) => void actions.remove(item)}
              />
            ))}
          </div>
        ) : (
          <SharedEmpty description={taskListHint(filter, TASK_LIST_LIMIT)} />
        )}
      </div>

      <TaskDetailModal
        task={detailTask}
        onOpenChange={(next) => {
          if (!next) setDetailTaskId(null);
        }}
      />
    </Modal>
  );
};
