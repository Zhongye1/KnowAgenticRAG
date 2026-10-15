/**
 * 任务详情弹窗。
 *
 * 列表项不含 `payload` 与 `result`（后端 `to_summary_dict()` 去掉的两个大字段），
 * 因此打开详情时才按 id 取一次；提交参数与执行结果按 JSON 折叠展示，方便排障时
 * 看清这次任务到底动了哪些文件。
 */
import { Empty, Modal, Spin } from 'antd';

import { describeFailure } from '@/shared/api';

import type { TaskSummary } from '../api/task-center-api';
import {
  buildTaskDetailRows,
  hasContent,
  prettyJson,
} from '../lib/task-detail';
import { useTaskDetail } from '../model/task-center-queries';
import styles from './task-center.module.css';

type TaskDetailModalProps = {
  /** 打开详情的任务；为 `null` 时不渲染。 */
  task: TaskSummary | null;
  onOpenChange: (open: boolean) => void;
};

const JsonBlock = ({ title, value }: { title: string; value: unknown }) => (
  <>
    <div className={styles.detailSection}>{title}</div>
    <pre className={styles.detailJson}>{prettyJson(value)}</pre>
  </>
);

export const TaskDetailModal = ({ task, onOpenChange }: TaskDetailModalProps) => {
  const detail = useTaskDetail(task?.id ?? null);

  return (
    <Modal
      open={Boolean(task)}
      title={task?.name ?? '任务详情'}
      width={560}
      footer={null}
      onCancel={() => onOpenChange(false)}
    >
      {detail.isPending ? (
        <div className="flex justify-center py-10">
          <Spin />
        </div>
      ) : detail.data ? (
        <div>
          <div className={styles.detailRows}>
            {buildTaskDetailRows(detail.data).map((row) => (
              <div key={row.label} className={styles.detailRow}>
                <span className={styles.detailLabel}>{row.label}</span>
                <span className={styles.detailValue}>{row.value}</span>
              </div>
            ))}
          </div>
          {hasContent(detail.data.payload) ? (
            <JsonBlock title="提交参数" value={detail.data.payload} />
          ) : null}
          {hasContent(detail.data.result) ? (
            <JsonBlock title="执行结果" value={detail.data.result} />
          ) : null}
        </div>
      ) : (
        <Empty description={describeFailure(detail.error, '任务详情加载失败。')} />
      )}
    </Modal>
  );
};
