/**
 * 一条后台任务。
 *
 * 标题是打开详情的入口，不是整卡：卡内还有取消/删除按钮，整卡可点会让按钮嵌套在
 * 另一个可点元素里，键盘与读屏都分不开。非终态显示进度条与最新一条进度描述，
 * 错误始终显示（终态的错误才是排障要用的那条）。
 */
import { Button, Progress } from 'antd';

import { formatRelativeTime } from '@/shared/lib';

import type { TaskSummary } from '../api/task-center-api';
import {
  canCancelTask,
  formatTaskDuration,
  formatTaskId,
  isTaskFinished,
  taskStatusLabel,
  taskTypeLabel,
} from '../lib/task-status';
import styles from './task-center.module.css';

type TaskCardProps = {
  task: TaskSummary;
  onOpenDetail: (task: TaskSummary) => void;
  onCancel: (taskId: string) => void;
  onDelete: (task: TaskSummary) => void;
};

/** 相对时间；不可解析时不给文案，避免出现一个空的时间位。 */
const relative = (value: string | null): string | null =>
  value ? formatRelativeTime(value) || null : null;

export const TaskCard = ({
  task,
  onOpenDetail,
  onCancel,
  onDelete,
}: TaskCardProps) => {
  const finished = isTaskFinished(task.status);
  const duration = formatTaskDuration(task);
  const percent = Math.round(task.progress || 0);
  const started = relative(task.started_at);
  const created = relative(task.created_at);
  const completed = relative(task.completed_at);

  return (
    <div className={styles.card} data-testid={`task-card-${task.id}`}>
      <div className={styles.cardHead}>
        <div className={styles.cardInfo}>
          <button
            type="button"
            className={styles.cardTitle}
            title={task.name}
            onClick={() => onOpenDetail(task)}
          >
            {task.name}
          </button>
          <div className={styles.cardMeta}>
            <span>{taskTypeLabel(task.type)}</span>
            <span className={styles.cardId}>#{formatTaskId(task.id)}</span>
            {duration ? (
              <span className={styles.cardDuration}>{duration}</span>
            ) : null}
          </div>
        </div>
        <span className={styles.status} data-status={task.status}>
          <span className={styles.statusDot} aria-hidden />
          {taskStatusLabel(task.status)}
        </span>
      </div>

      {finished ? null : (
        <div className={styles.cardProgress}>
          <Progress
            percent={percent}
            status="active"
            strokeWidth={4}
            showInfo={false}
            aria-label="任务进度"
          />
          <span className={styles.progressText}>{percent}%</span>
        </div>
      )}

      {!finished && task.message ? (
        <div className={styles.cardMessage}>{task.message}</div>
      ) : null}
      {task.error ? <div className={styles.cardError}>{task.error}</div> : null}

      <div className={styles.cardFooter}>
        <div className={styles.cardTimes}>
          {started ? <span>开始 {started}</span> : null}
          {!started && created ? <span>创建 {created}</span> : null}
          {completed ? <span>· 完成 {completed}</span> : null}
        </div>
        <div>
          {canCancelTask(task) ? (
            <Button
              htmlType="button"
              type="text"
              size="small"
              danger
              onClick={() => onCancel(task.id)}
            >
              取消
            </Button>
          ) : null}
          {finished ? (
            <Button
              htmlType="button"
              type="text"
              size="small"
              danger
              onClick={() => onDelete(task)}
            >
              删除
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
