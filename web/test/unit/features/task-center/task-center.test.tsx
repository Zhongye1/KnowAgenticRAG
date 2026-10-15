/**
 * 任务中心：入口门禁、角标、列表与筛选、取消/删除的二次确认、详情与失败分支。
 *
 * 这里不 mock `task-center-api`，而是 mock 生成的 SDK：`unwrap` 的解包与 `ApiError`
 * 文案都走真实实现。确认框与通知在应用里由 `AntdApp` 承载，测试里替换成桩。
 */
import {
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AntdProvider } from '@/app/theme/antd-provider';

/** 多个用例要驱动弹窗、筛选与二次确认，给本文件单独放宽预算。 */
vi.setConfig({ testTimeout: 15000 });

const { api, session, notifications, confirmMock } = vi.hoisted(() => ({
  api: { list: vi.fn(), detail: vi.fn(), cancel: vi.fn(), remove: vi.fn() },
  session: { isAdmin: true },
  notifications: { addNotification: vi.fn() },
  confirmMock: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  listTasksApiTasksGet: (...args: unknown[]) => api.list(...args),
  getTaskApiTasksTaskIdGet: (...args: unknown[]) => api.detail(...args),
  cancelTaskApiTasksTaskIdCancelPost: (...args: unknown[]) => api.cancel(...args),
  deleteTaskApiTasksTaskIdDelete: (...args: unknown[]) => api.remove(...args),
}));

vi.mock('@/entities/session', () => ({
  useIsAdmin: () => session.isAdmin,
}));

vi.mock('@/shared/ui/notifications', () => ({
  useNotifications: () => notifications,
}));

vi.mock('@/shared/ui/confirm-dialog', () => ({
  useConfirm: () => ({ confirm: (...args: unknown[]) => confirmMock(...args) }),
}));

const { TaskCenter } = await import('@/features/task-center');

/** 五条任务覆盖五种状态：两条非终态、三条终态，其中一条已请求取消。 */
const TASKS = [
  {
    id: 't-ingest',
    name: '导入《设备手册》',
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
  },
  {
    id: 't-dataset',
    name: '生成评估集',
    type: 'dataset_generation',
    status: 'queued',
    progress: 0,
    message: '任务已排队',
    created_at: '2026-10-15T02:02:00Z',
    updated_at: '2026-10-15T02:02:00Z',
    started_at: null,
    completed_at: null,
    error: null,
    cancel_requested: false,
  },
  {
    id: 't-index',
    name: '文档入库',
    type: 'knowledge_index',
    status: 'success',
    progress: 100,
    message: '入库完成',
    created_at: '2026-10-15T01:00:00Z',
    updated_at: '2026-10-15T01:05:00Z',
    started_at: '2026-10-15T01:00:10Z',
    completed_at: '2026-10-15T01:05:00Z',
    error: null,
    cancel_requested: false,
  },
  {
    id: 't-parse',
    name: '解析附件',
    type: 'knowledge_parse',
    status: 'failed',
    progress: 30,
    message: '',
    created_at: '2026-10-15T00:00:00Z',
    updated_at: '2026-10-15T00:01:00Z',
    started_at: '2026-10-15T00:00:10Z',
    completed_at: '2026-10-15T00:01:00Z',
    error: '解析失败：文件已损坏',
    cancel_requested: false,
  },
  {
    id: 't-eval',
    name: 'RAG 评估',
    type: 'rag_evaluation',
    status: 'cancelled',
    progress: 10,
    message: '',
    created_at: '2026-10-14T23:00:00Z',
    updated_at: '2026-10-14T23:10:00Z',
    started_at: '2026-10-14T23:00:10Z',
    completed_at: '2026-10-14T23:10:00Z',
    error: null,
    cancel_requested: true,
  },
];

const LIST_RESPONSE = {
  tasks: TASKS,
  summary: {
    total: 5,
    filtered_total: 5,
    status_counts: { running: 1, queued: 1, success: 1, failed: 1, cancelled: 1 },
    type_counts: { knowledge_ingest: 1 },
  },
};

const ok = (data: unknown) => ({ data, error: undefined });

const renderCenter = (collapsed = false) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <AntdProvider>
      <QueryClientProvider client={client}>
        <TaskCenter collapsed={collapsed} />
      </QueryClientProvider>
    </AntdProvider>,
  );
  return client;
};

/** 入口按钮的无障碍名带角标数，测试统一按前缀定位。 */
const trigger = () => screen.getByRole('button', { name: /^任务中心/ });

const openPanel = async () => {
  await user.click(trigger());
  await screen.findByText(/只表示任务执行结束/);
};

const cardOf = (id: string) => screen.getByTestId(`task-card-${id}`);

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  notifications.addNotification.mockReset();
  confirmMock.mockReset();
  session.isAdmin = true;
  user = userEvent.setup();
  api.list.mockResolvedValue(ok(LIST_RESPONSE));
  api.detail.mockResolvedValue(
    ok({
      task: {
        ...TASKS[2],
        payload: { kb_id: 'kb-1', file_ids: ['f-1'] },
        result: { indexed: 12 },
      },
    }),
  );
  api.cancel.mockResolvedValue(ok({ task_id: 't-ingest', status: 'cancelled' }));
  api.remove.mockResolvedValue(ok({ task_id: 't-index', status: 'deleted' }));
  confirmMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('任务中心入口', () => {
  it('非管理员不渲染入口，也不读任务', async () => {
    session.isAdmin = false;
    renderCenter();

    expect(screen.queryByRole('button', { name: /^任务中心/ })).toBeNull();
    await waitFor(() => expect(api.list).not.toHaveBeenCalled());
  });

  it('折叠态不渲染入口，也不读任务', async () => {
    renderCenter(true);

    expect(screen.queryByRole('button', { name: /^任务中心/ })).toBeNull();
    await waitFor(() => expect(api.list).not.toHaveBeenCalled());
  });

  it('角标只数非终态任务，无障碍名带上数量', async () => {
    renderCenter();

    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
    const button = await screen.findByRole('button', {
      name: '任务中心，2 个进行中',
    });

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(within(button).getByText('2')).toBeInTheDocument();
  });

  it('没有非终态任务时角标不显示数字', async () => {
    api.list.mockResolvedValue(
      ok({
        tasks: [TASKS[2]],
        summary: {
          total: 1,
          filtered_total: 1,
          status_counts: { success: 1 },
          type_counts: {},
        },
      }),
    );
    renderCenter();

    const button = await screen.findByRole('button', { name: '任务中心' });

    expect(within(button).queryByText('1')).toBeNull();
  });
});

describe('任务中心面板', () => {
  it('打开即取一次最新状态，卡片显示名称、类型、任务号与状态', async () => {
    renderCenter();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));

    await openPanel();

    expect(api.list).toHaveBeenCalledTimes(2);
    const card = cardOf('t-ingest');
    expect(within(card).getByText('导入《设备手册》')).toBeInTheDocument();
    expect(within(card).getByText('知识库导入')).toBeInTheDocument();
    // 任务号截断到前 8 位；这里的 id 本身不到 8 位，原样显示
    expect(within(card).getByText('#t-ingest')).toBeInTheDocument();
    expect(within(card).getByText('进行中')).toBeInTheDocument();
    expect(within(card).getByText('40%')).toBeInTheDocument();
    expect(within(card).getByText('正在解析 3/10')).toBeInTheDocument();
  });

  it('终态卡片不显示进度条，错误照原样展示', async () => {
    renderCenter();
    await openPanel();

    expect(within(cardOf('t-index')).queryByText('100%')).toBeNull();
    expect(
      within(cardOf('t-parse')).getByText('解析失败：文件已损坏'),
    ).toBeInTheDocument();
  });

  it('档位计数取后端汇总，切换档位只留该类任务', async () => {
    renderCenter();
    await openPanel();

    expect(screen.getByRole('button', { name: '全部 5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '进行中 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '失败 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '失败 2' }));

    expect(cardOf('t-parse')).toBeInTheDocument();
    expect(cardOf('t-eval')).toBeInTheDocument();
    expect(screen.queryByTestId('task-card-t-ingest')).toBeNull();
  });

  it('筛选后没有任务时给出该档位的空态', async () => {
    api.list.mockResolvedValue(
      ok({
        tasks: [TASKS[2]],
        summary: {
          total: 1,
          filtered_total: 1,
          status_counts: { success: 1 },
          type_counts: {},
        },
      }),
    );
    renderCenter();
    await openPanel();

    await user.click(screen.getByRole('button', { name: '进行中 0' }));

    expect(
      screen.getByText('暂无进行中的任务，当前没有正在等待或执行的后台任务。'),
    ).toBeInTheDocument();
  });

  it('取列表失败时显示后端给的失败原因', async () => {
    api.list.mockResolvedValue({ error: { detail: '需要管理员权限' } });
    renderCenter();

    await openPanel();

    expect(screen.getByText('需要管理员权限')).toBeInTheDocument();
  });
});

describe('任务中心的操作', () => {
  it('取消只在非终态且未请求取消的任务上出现，提交后重取列表', async () => {
    renderCenter();
    await openPanel();

    await user.click(within(cardOf('t-ingest')).getByRole('button', { name: '取消' }));

    await waitFor(() =>
      expect(api.cancel).toHaveBeenCalledWith({ path: { task_id: 't-ingest' } }),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
    // 取消是请求受理，真实状态要等重取的列表
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));
    expect(
      within(cardOf('t-eval')).queryByRole('button', { name: '取消' }),
    ).toBeNull();
  });

  it('删除先二次确认，确认后才发请求', async () => {
    renderCenter();
    await openPanel();

    await user.click(within(cardOf('t-index')).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(api.remove).toHaveBeenCalledWith({ path: { task_id: 't-index' } }),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('确认框里选取消时不发删除请求', async () => {
    confirmMock.mockResolvedValue(false);
    renderCenter();
    await openPanel();

    await user.click(within(cardOf('t-index')).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('删除失败时通知后端给出的原因', async () => {
    api.remove.mockResolvedValue({ error: { detail: '任务正在执行' } });
    renderCenter();
    await openPanel();

    await user.click(within(cardOf('t-index')).getByRole('button', { name: '删除' }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: '任务正在执行',
        }),
      ),
    );
  });
});

describe('任务详情', () => {
  it('点标题取详情并展示提交参数与执行结果', async () => {
    renderCenter();
    await openPanel();

    await user.click(screen.getByRole('button', { name: '文档入库' }));

    await waitFor(() =>
      expect(api.detail).toHaveBeenCalledWith({ path: { task_id: 't-index' } }),
    );
    expect(await screen.findByText('提交参数')).toBeInTheDocument();
    expect(screen.getByText(/"kb_id": "kb-1"/)).toBeInTheDocument();
    expect(screen.getByText('执行结果')).toBeInTheDocument();
    expect(screen.getByText(/"indexed": 12/)).toBeInTheDocument();
  });

  it('列表项不带 payload 与 result，详情里才出现', async () => {
    renderCenter();
    await openPanel();

    expect(screen.queryByText('提交参数')).toBeNull();
    expect(api.detail).not.toHaveBeenCalled();
  });
});
