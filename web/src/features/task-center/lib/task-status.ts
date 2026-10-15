/**
 * 后台任务的状态、类型、时长与空态文案。
 *
 * 状态集合与后端 `ars/services/task_service.py` 的 `TERMINAL_STATUSES` 对齐：非终态
 * 参与角标计数、显示进度条、可请求取消；终态只留删除。后端新增状态而这里没跟上时，
 * 未知值按终态渲染（不计数、不可取消），并把原值显示出来，不静默当成某一个已知状态。
 */
import type {
  TaskListSummary,
  TaskStatus,
  TaskSummary,
} from '../api/task-center-api';

/** 面板筛选档位；顺序即筛选组的显示顺序。 */
export type TaskFilter = 'all' | 'active' | 'success' | 'failed';

type TaskStatusMeta = {
  label: string;
  terminal: boolean;
  cancelable: boolean;
};

const STATUS_META: Record<TaskStatus, TaskStatusMeta> = {
  pending: { label: '等待中', terminal: false, cancelable: true },
  queued: { label: '已排队', terminal: false, cancelable: true },
  running: { label: '进行中', terminal: false, cancelable: true },
  success: { label: '已完成', terminal: true, cancelable: false },
  failed: { label: '失败', terminal: true, cancelable: false },
  cancelled: { label: '已取消', terminal: true, cancelable: false },
};

/** 参与角标计数的非终态。 */
export const ACTIVE_STATUSES: readonly TaskStatus[] = [
  'pending',
  'queued',
  'running',
];

/** 按筛选档位归入「失败」的两个终态：都表示这次后台作业没拿到结果。 */
const FAILED_STATUSES: readonly TaskStatus[] = ['failed', 'cancelled'];

/** 任务类型 → 中文名；后端新增类型时回落为原值。 */
const TASK_TYPE_LABELS: Record<string, string> = {
  knowledge_ingest: '知识库导入',
  knowledge_parse: '文档解析',
  knowledge_index: '文档入库',
  knowledge_graph_index: '图谱构建',
  knowledge_virtual_folder_migration: '虚拟目录迁移',
  dataset_generation: '评估集生成',
  rag_evaluation: 'RAG 评估',
};

/** 未知状态没有元数据：按终态处理，界面显示后端原值。 */
const readMeta = (status: string): TaskStatusMeta | undefined =>
  STATUS_META[status as TaskStatus];

export const taskStatusLabel = (status: string): string =>
  readMeta(status)?.label ?? (status || '未知状态');

export const taskTypeLabel = (type: string): string =>
  TASK_TYPE_LABELS[type] ?? (type || '后台任务');

/** 终态以外都算「进行中」；未知状态不算，避免角标把后端新增状态算成活跃。 */
export const isTaskActive = (status: string): boolean =>
  readMeta(status)?.terminal === false;

/** 是否还显示进度条：终态与未知状态都不显示。 */
export const isTaskFinished = (status: string): boolean =>
  readMeta(status)?.terminal ?? true;

/** 「已完成」只表示执行结束；只有 failed 与 cancelled 算这批作业没拿到结果。 */
export const isTaskFailed = (status: string): boolean =>
  FAILED_STATUSES.includes(status as TaskStatus);

/** 已请求取消的任务不再给取消按钮，避免重复提交。 */
export const canCancelTask = (task: TaskSummary): boolean =>
  !task.cancel_requested && readMeta(task.status)?.cancelable === true;

export const formatTaskId = (id: string): string =>
  id ? id.slice(0, 8) : '--';

/** 汇总里的非终态总数，用于角标与「进行中」档位。 */
export const countActiveTasks = (
  counts: TaskListSummary['status_counts'],
): number =>
  ACTIVE_STATUSES.reduce((total, status) => total + (counts[status] ?? 0), 0);

export const countFailedTasks = (
  counts: TaskListSummary['status_counts'],
): number =>
  FAILED_STATUSES.reduce((total, status) => total + (counts[status] ?? 0), 0);

export const filterTasks = (
  tasks: readonly TaskSummary[],
  filter: TaskFilter,
): TaskSummary[] => {
  switch (filter) {
    case 'active':
      return tasks.filter((task) => isTaskActive(task.status));
    case 'success':
      return tasks.filter((task) => task.status === 'success');
    case 'failed':
      return tasks.filter((task) => isTaskFailed(task.status));
    default:
      return [...tasks];
  }
};

/** 每个档位的空态文案；「全部」还要解释列表上限。 */
export const taskListHint = (filter: TaskFilter, limit: number): string => {
  switch (filter) {
    case 'active':
      return '暂无进行中的任务，当前没有正在等待或执行的后台任务。';
    case 'success':
      return '暂无已完成的任务，执行结束的后台任务会显示在这里。';
    case 'failed':
      return '暂无失败的任务，失败或已取消的后台任务会显示在这里。';
    default:
      return `暂无任务，提交知识库导入等后台任务后进度会显示在这里（仅保留最近 ${limit} 个）。`;
  }
};

/** 执行耗时，只按后端的开始与完成时间算；缺任一或不递增时不给数字。 */
export const formatTaskDuration = (task: TaskSummary): string | null => {
  if (!task.started_at || !task.completed_at) return null;
  const start = Date.parse(task.started_at);
  const end = Date.parse(task.completed_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${rest} 秒`;
  if (rest > 0) return `${rest} 秒`;
  return '小于 1 秒';
};
