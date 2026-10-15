/**
 * 任务中心的查询装配。
 *
 * 列表查询挂在导航列上而不是面板里：角标要在面板关着时也更新。轮询分两档——面板打开
 * 或确实存在非终态任务时按 5 秒重取，否则退到 12 秒低频兜底（别处提交的导入任务不会
 * 通知这里，没有兜底就要等下一次交互才出现）。窗口不可见时 react-query 默认暂停轮询。
 */
import { useQuery } from '@tanstack/react-query';

import { taskCenterApi } from '../api/task-center-api';
import { isTaskActive } from '../lib/task-status';

/** 面板打开或有任务在跑时的重取间隔。 */
export const TASK_ACTIVE_POLL_INTERVAL_MS = 5000;
/** 无活跃任务时的兜底重取间隔，与导航列的线程状态同步同档。 */
export const TASK_IDLE_POLL_INTERVAL_MS = 12000;

export const taskKeys = {
  all: ['tasks'] as const,
  list: () => [...taskKeys.all, 'list'] as const,
  detail: (taskId: string) => [...taskKeys.all, 'detail', taskId] as const,
};

type UseTasksOptions = {
  /** 管理员才有权限读任务；折叠态看不到角标，也一并关掉。 */
  enabled: boolean;
  /** 面板是否打开。 */
  focused: boolean;
};

export const useTasks = ({ enabled, focused }: UseTasksOptions) =>
  useQuery({
    queryKey: taskKeys.list(),
    queryFn: () => taskCenterApi.list(),
    enabled,
    refetchInterval: (query) =>
      focused ||
      (query.state.data?.tasks ?? []).some((task) => isTaskActive(task.status))
        ? TASK_ACTIVE_POLL_INTERVAL_MS
        : TASK_IDLE_POLL_INTERVAL_MS,
  });

/** 任务详情；列表项不带 `payload` 与 `result`，打开详情时才取。 */
export const useTaskDetail = (taskId: string | null) =>
  useQuery({
    queryKey: taskKeys.detail(taskId ?? ''),
    queryFn: () => taskCenterApi.get(taskId as string),
    enabled: Boolean(taskId),
  });
