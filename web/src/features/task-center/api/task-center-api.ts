/**
 * 后台任务中心（Tasker）的接口。
 *
 * 契约：`backend/server/routers/system_task_router.py`，四个端点全部要求管理员
 * （`get_admin_user`）——界面上入口只对管理员显示，但授权边界在后端。响应没有
 * `response_model`，类型在这里按 `ars/services/task_service.py` 的 `Task` 手写。
 *
 * 列表项是后端的 `to_summary_dict()`：去掉 `payload` 与 `result`（可能很大），
 * 详情才有；取消端点只返回「请求已受理」，任务真实进度要等下一次轮询。
 */
import { unwrap } from '@/shared/api';
import {
  cancelTaskApiTasksTaskIdCancelPost,
  deleteTaskApiTasksTaskIdDelete,
  getTaskApiTasksTaskIdGet,
  listTasksApiTasksGet,
} from '@/shared/api/generated/sdk.gen';

export type TaskStatus =
  'pending' | 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

/** 列表项；后端 `to_summary_dict()` 的形状。 */
export type TaskSummary = {
  id: string;
  name: string;
  type: string;
  status: TaskStatus;
  progress: number;
  message: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  cancel_requested: boolean;
};

/** 详情：比列表项多出提交参数与执行结果。 */
export type TaskDetail = TaskSummary & {
  payload: Record<string, unknown>;
  result: unknown;
};

export type TaskListSummary = {
  /** 全部任务数，不受 `status` 过滤影响。 */
  total: number;
  filtered_total: number;
  status_counts: Partial<Record<TaskStatus, number>>;
  type_counts: Partial<Record<string, number>>;
};

export type TaskListResponse = {
  tasks: TaskSummary[];
  summary: TaskListSummary;
};

/** 后端 `list_tasks` 的 limit 上限；超出会被 422 拒绝。 */
export const TASK_LIST_LIMIT = 100;

/** 首屏取数前的空汇总，让计数与空态在没数据时也能渲染。 */
export const EMPTY_TASK_SUMMARY: TaskListSummary = {
  total: 0,
  filtered_total: 0,
  status_counts: {},
  type_counts: {},
};

export const taskCenterApi = {
  async list(): Promise<TaskListResponse> {
    const result = unwrap<TaskListResponse>(
      await listTasksApiTasksGet({ query: { limit: TASK_LIST_LIMIT } }),
    );
    return {
      tasks: result.tasks ?? [],
      summary: result.summary ?? {
        total: 0,
        filtered_total: 0,
        status_counts: {},
        type_counts: {},
      },
    };
  },

  async get(taskId: string): Promise<TaskDetail> {
    const result = unwrap<{ task: TaskDetail }>(
      await getTaskApiTasksTaskIdGet({ path: { task_id: taskId } }),
    );
    return result.task;
  },

  async cancel(taskId: string): Promise<void> {
    unwrap(
      await cancelTaskApiTasksTaskIdCancelPost({
        path: { task_id: taskId },
      }),
    );
  },

  async remove(taskId: string): Promise<void> {
    unwrap(await deleteTaskApiTasksTaskIdDelete({ path: { task_id: taskId } }));
  },
};
