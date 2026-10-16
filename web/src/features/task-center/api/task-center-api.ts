/**
 * 后台任务中心（Tasker）的接口。
 *
 * 契约：`backend/server/routers/system_task_router.py`，四个端点全部要求管理员
 * （`get_admin_user`）——界面上入口只对管理员显示，但授权边界在后端。响应类型直接复用生成物
 * （`TaskListResponse` / `TaskItemResponse`；取消与删除只回「已受理」，调用点丢弃响应体）；
 * `TaskStatus` 是任务中心自己的状态联合，只用于界面渲染。
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
import type {
  TaskItem,
  TaskItemResponse,
  TaskListResponse as GeneratedTaskListResponse,
  TaskListSummary as GeneratedTaskListSummary,
  TaskSummaryItem,
} from '@/shared/api/generated/types.gen';

/** 任务状态联合；任务中心的界面形状，用于状态文案与筛选，不是后端的响应类型。 */
export type TaskStatus =
  'pending' | 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

/** 列表项；契约 `TaskSummaryItem`（后端 `to_summary_dict()` 的形状）。 */
export type TaskSummary = TaskSummaryItem;

/** 详情：比列表项多出提交参数与执行结果；契约 `TaskItem`。 */
export type TaskDetail = TaskItem;

/** 列表汇总计数；契约 `TaskListSummary`。 */
export type TaskListSummary = GeneratedTaskListSummary;

/** 任务列表响应；契约 `TaskListResponse`。 */
export type TaskListResponse = GeneratedTaskListResponse;

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
    const result = unwrap<TaskItemResponse>(
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
