/**
 * 任务中心的状态、类型、时长与空态文案。
 *
 * 这套纯函数决定三件界面事实：角标数什么、哪些任务能取消、卡片是否还显示进度条，
 * 因此逐个钉住，并用一个后端未知状态证明它不会被当成活跃或可取消。
 */
import { describe, expect, it } from 'vitest';

import type { TaskSummary } from '@/features/task-center/api/task-center-api';
import {
  canCancelTask,
  countActiveTasks,
  countFailedTasks,
  filterTasks,
  formatTaskDuration,
  formatTaskId,
  isTaskActive,
  isTaskFailed,
  isTaskFinished,
  taskListHint,
  taskStatusLabel,
  taskTypeLabel,
} from '@/features/task-center/lib/task-status';
import { buildTaskDetailRows } from '@/features/task-center/lib/task-detail';

const task = (over: Partial<TaskSummary> = {}): TaskSummary => ({
  id: 'task-1234567890',
  name: '导入《手册》',
  type: 'knowledge_ingest',
  status: 'running',
  progress: 40,
  message: '正在解析 3/10',
  created_at: '2026-10-15T02:00:00Z',
  updated_at: '2026-10-15T02:01:00Z',
  started_at: '2026-10-15T02:00:10Z',
  completed_at: null,
  error: null,
  cancel_requested: false,
  ...over,
});

describe('任务状态判定', () => {
  it('非终态是活跃的，终态不是', () => {
    expect(isTaskActive('pending')).toBe(true);
    expect(isTaskActive('queued')).toBe(true);
    expect(isTaskActive('running')).toBe(true);
    expect(isTaskActive('success')).toBe(false);
    expect(isTaskActive('failed')).toBe(false);
    expect(isTaskActive('cancelled')).toBe(false);
  });

  it('后端新增的状态不算活跃，也不进入可取消集合', () => {
    expect(isTaskActive('paused')).toBe(false);
    expect(isTaskFinished('paused')).toBe(true);
    expect(canCancelTask(task({ status: 'paused' as TaskSummary['status'] }))).toBe(
      false,
    );
    // 原值照原样显示，不被折成某个已知状态
    expect(taskStatusLabel('paused')).toBe('paused');
  });

  it('已请求取消的任务不再给取消入口', () => {
    expect(canCancelTask(task({ cancel_requested: true }))).toBe(false);
    expect(canCancelTask(task({ status: 'success' }))).toBe(false);
    expect(canCancelTask(task())).toBe(true);
  });

  it('只有 failed 与 cancelled 算这批作业没拿到结果', () => {
    expect(isTaskFailed('failed')).toBe(true);
    expect(isTaskFailed('cancelled')).toBe(true);
    expect(isTaskFailed('success')).toBe(false);
  });

  it('类型与状态文案回落为后端原值', () => {
    expect(taskTypeLabel('knowledge_graph_index')).toBe('图谱构建');
    expect(taskTypeLabel('unknown_type')).toBe('unknown_type');
    expect(taskTypeLabel('')).toBe('后台任务');
    expect(taskStatusLabel('queued')).toBe('已排队');
  });
});

describe('计数与筛选', () => {
  const counts = { running: 2, queued: 1, success: 3, failed: 1, cancelled: 2 };

  it('角标只数非终态，失败档位含已取消', () => {
    expect(countActiveTasks(counts)).toBe(3);
    expect(countFailedTasks(counts)).toBe(3);
    expect(countActiveTasks({})).toBe(0);
  });

  it('各档位按状态归类，全部档位原样返回', () => {
    const tasks = [
      task({ id: 'a', status: 'running' }),
      task({ id: 'b', status: 'success' }),
      task({ id: 'c', status: 'failed' }),
      task({ id: 'd', status: 'cancelled' }),
    ];

    expect(filterTasks(tasks, 'active').map((item) => item.id)).toEqual(['a']);
    expect(filterTasks(tasks, 'success').map((item) => item.id)).toEqual(['b']);
    expect(filterTasks(tasks, 'failed').map((item) => item.id)).toEqual([
      'c',
      'd',
    ]);
    expect(filterTasks(tasks, 'all')).toHaveLength(4);
  });

  it('空态文案说明当前档位，全部档位附带列表上限', () => {
    expect(taskListHint('active', 100)).toContain('暂无进行中的任务');
    expect(taskListHint('all', 100)).toContain('最近 100 个');
  });
});

describe('展示格式化', () => {
  it('任务号只取前 8 位', () => {
    expect(formatTaskId('task-1234567890')).toBe('task-123');
    expect(formatTaskId('')).toBe('--');
  });

  it('耗时按开始与完成时间算，缺任一时间不给数字', () => {
    expect(formatTaskDuration(task())).toBeNull();
    expect(
      formatTaskDuration(
        task({
          started_at: '2026-10-15T02:00:00Z',
          completed_at: '2026-10-15T02:00:00Z',
        }),
      ),
    ).toBe('小于 1 秒');
    expect(
      formatTaskDuration(
        task({
          started_at: '2026-10-15T02:00:00Z',
          completed_at: '2026-10-15T02:03:20Z',
        }),
      ),
    ).toBe('3 分 20 秒');
    expect(
      formatTaskDuration(
        task({
          started_at: '2026-10-15T02:00:00Z',
          completed_at: '2026-10-15T04:30:00Z',
        }),
      ),
    ).toBe('2 小时 30 分');
  });

  it('详情行覆盖后端字段，缺失的时间给 -', () => {
    const rows = buildTaskDetailRows({
      ...task(),
      payload: { kb_id: 'kb-1' },
      result: null,
    });

    expect(rows).toContainEqual({ label: '类型', value: '知识库导入' });
    expect(rows).toContainEqual({ label: '任务号', value: 'task-1234567890' });
    expect(rows).toContainEqual({ label: '完成时间', value: '-' });
    expect(rows).toContainEqual({ label: '错误', value: '-' });
  });
});
