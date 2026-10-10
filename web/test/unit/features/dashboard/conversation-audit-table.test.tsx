/**
 * 会话审计表：筛选、服务端分页、点行开详情。
 *
 * 断言的是「界面改了什么 → 真的发了什么请求」：改筛选回第 1 页、
 * 翻页只改 offset、空结果给引导文案、保留上一页数据期间行入口禁用。
 * 详情抽屉与表格同属一条链路，放在同一文件里验证「点行 → 拿到详情 → 渲染消息」。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conversationDetail,
  conversationList,
  conversationOptions,
} from './fixtures';

/**
 * 这套用例逐个靠 userEvent 驱动弹窗与表单，全套件并行跑时会超过默认 5 秒预算；
 * 与 `knowledge-file-table` 等重交互文件同一口径，给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const { api } = vi.hoisted(() => ({
  api: { list: vi.fn(), options: vi.fn(), detail: vi.fn() },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getAllConversationsApiDashboardConversationsGet: (...args: unknown[]) =>
    api.list(...args),
  getConversationFilterOptionsApiDashboardConversationsOptionsGet: (
    ...args: unknown[]
  ) => api.options(...args),
  getConversationDetailApiDashboardConversationsThreadIdGet: (
    ...args: unknown[]
  ) => api.detail(...args),
}));

vi.mock('@/features/dashboard/ui/echart', async () => {
  const { EChart } = await import('./chart-probe');
  return { EChart };
});

const { ConversationAuditTable } =
  await import('@/features/dashboard/ui/conversation-audit-table');
const { ThreadDetailDrawer } =
  await import('@/features/dashboard/ui/thread-detail-drawer');

const onOpenThread = vi.fn();

/** 表格 + 抽屉：与 `threads-tab` 相同的闭环，点行打开抽屉。 */
const Harness = () => {
  const [threadId, setThreadId] = React.useState<string | null>(null);
  return (
    <>
      <ConversationAuditTable onOpenThread={setThreadId} />
      <ThreadDetailDrawer
        threadId={threadId}
        onOpenChange={(open) => {
          if (!open) setThreadId(null);
        }}
      />
    </>
  );
};

const renderTable = (harness = false) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {harness ? (
        <Harness />
      ) : (
        <ConversationAuditTable onOpenThread={onOpenThread} />
      )}
    </QueryClientProvider>,
  );
};

/** 打开 Radix Select 并选中一项。 */
const selectOption = async (triggerName: string, optionName: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: triggerName }));
  const option = await screen.findByRole('option', { name: optionName });
  await userEvent.click(option);
};

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({ data: conversationList });
  api.options.mockResolvedValue({ data: conversationOptions });
  api.detail.mockResolvedValue({ data: conversationDetail });
});

describe('初始请求', () => {
  it('默认查全部状态、第 1 页、10 条，并加载筛选项', async () => {
    renderTable();

    await waitFor(() =>
      expect(api.list).toHaveBeenCalledWith({
        query: {
          status: 'all',
          search: undefined,
          agent_id: undefined,
          uid: undefined,
          limit: 10,
          offset: 0,
        },
      }),
    );
    expect(api.options).toHaveBeenCalledTimes(1);
    const rows = await screen.findAllByTestId('conversation-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('取消事件验证');
    expect(within(rows[0]).getByTestId('conversation-status').textContent).toBe(
      '进行中',
    );
    expect(screen.getByTestId('conversation-total').textContent).toBe(
      '共 27 条会话，第 1 / 3 页',
    );
  });
});

describe('筛选', () => {
  it('关键词要回车或点「查询」才生效，并回到第 1 页', async () => {
    renderTable();
    await screen.findAllByTestId('conversation-row');

    const input = screen.getByLabelText('搜索会话');
    await userEvent.type(input, '事件');
    // 只输入不提交：请求参数不变
    expect(api.list).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({
        query: {
          status: 'all',
          search: '事件',
          agent_id: undefined,
          uid: undefined,
          limit: 10,
          offset: 0,
        },
      }),
    );
  });

  it('先翻页再改筛选，筛选从第 1 页重新查', async () => {
    // 变异：改筛选不归位会让新条件带着 offset=10 查，首条被跳过
    renderTable();
    await screen.findAllByTestId('conversation-row');

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ offset: 10 }),
        }),
      ),
    );

    await selectOption('按会话状态筛选', '已删除');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({
        query: {
          status: 'deleted',
          search: undefined,
          agent_id: undefined,
          uid: undefined,
          limit: 10,
          offset: 0,
        },
      }),
    );
  });

  it('按智能体筛选下发 agent_id；已删除的候选标出状态', async () => {
    renderTable();
    await screen.findAllByTestId('conversation-row');

    await userEvent.click(
      screen.getByRole('combobox', { name: '按智能体筛选' }),
    );
    expect(
      await screen.findByRole('option', { name: '退休助手（已删除）' }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('option', { name: '智能助手' }));

    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            agent_id: 'default-chatbot',
            offset: 0,
          }),
        }),
      ),
    );
  });

  it('按用户筛选下发 uid', async () => {
    renderTable();
    await screen.findAllByTestId('conversation-row');

    await selectOption('按用户筛选', '张文杰');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ uid: 'zwj' }),
        }),
      ),
    );
  });

  it('重置清空关键词、状态与实体筛选，并回到第 1 页', async () => {
    renderTable();
    await screen.findAllByTestId('conversation-row');

    const reset = screen.getByRole('button', { name: '重置' });
    expect(reset).toBeDisabled();

    await userEvent.type(screen.getByLabelText('搜索会话'), '事件');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(reset).toBeEnabled());

    await userEvent.click(reset);
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({
        query: {
          status: 'all',
          search: undefined,
          agent_id: undefined,
          uid: undefined,
          limit: 10,
          offset: 0,
        },
      }),
    );
    expect(screen.getByLabelText('搜索会话')).toHaveValue('');
  });
});

describe('分页', () => {
  it('翻页只改 offset；首页禁用「上一页」，末页禁用「下一页」', async () => {
    renderTable();
    await screen.findAllByTestId('conversation-row');

    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ offset: 10, limit: 10 }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('conversation-total').textContent).toBe(
        '共 27 条会话，第 2 / 3 页',
      ),
    );
  });

  it('改页长回到第 1 页并按新页长查询', async () => {
    renderTable();
    await screen.findAllByTestId('conversation-row');

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() =>
      expect(screen.getByTestId('conversation-total').textContent).toContain(
        '第 2 / 3 页',
      ),
    );

    await selectOption('每页条数', '50 条/页');
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ limit: 50, offset: 0 }),
        }),
      ),
    );
  });

  it('加载下一页期间禁止再次翻页与点行（表里还是上一页的数据）', async () => {
    // 变异：不按 isFetching 禁用，用户会把旧行当成新条件下的结果点开
    renderTable();
    await screen.findAllByTestId('conversation-row');

    let resolveSecond: ((value: unknown) => void) | undefined;
    api.list.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled(),
    );
    await userEvent.click(screen.getAllByTestId('conversation-row')[0]);
    expect(onOpenThread).not.toHaveBeenCalled();

    resolveSecond?.({ data: { ...conversationList, offset: 10 } });
  });
});

describe('空态与失败', () => {
  it('没有符合条件的会话时给引导文案而不是空表', async () => {
    api.list.mockResolvedValue({
      data: { items: [], total: 0, limit: 10, offset: 0 },
    });
    renderTable();

    expect(
      await screen.findByText(
        '没有符合当前条件的会话，可调整关键词或状态后重试。',
      ),
    ).toBeTruthy();
    expect(screen.queryAllByTestId('conversation-row')).toHaveLength(0);
    expect(screen.getByTestId('conversation-total').textContent).toBe(
      '共 0 条会话，第 1 / 1 页',
    );
  });

  it('失败时给文案与重试入口', async () => {
    api.list.mockResolvedValueOnce({
      error: { detail: 'boom' },
      response: { status: 500 },
    });
    renderTable();

    const failed = await screen.findByTestId('conversation-audit-error');
    expect(within(failed).getByText('会话列表加载失败。')).toBeTruthy();
    api.list.mockResolvedValue({ data: conversationList });
    await userEvent.click(
      within(failed).getByRole('button', { name: '重新加载' }),
    );
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });
});

describe('会话详情抽屉', () => {
  it('点行打开抽屉并按 thread_id 拉详情，消息时间线渲染角色与内容', async () => {
    renderTable(true);
    const rows = await screen.findAllByTestId('conversation-row');

    await userEvent.click(rows[0]);

    await waitFor(() =>
      expect(api.detail).toHaveBeenCalledWith({
        path: { thread_id: conversationList.items[0].thread_id },
      }),
    );
    const drawer = await screen.findByTestId('thread-detail-drawer');
    expect(within(drawer).getByText('取消事件验证')).toBeTruthy();
    expect(within(drawer).getByText(/进行中 · 3 条消息/)).toBeTruthy();

    const messages = await screen.findAllByTestId('thread-message');
    expect(messages).toHaveLength(2);
    expect(messages[0].textContent).toContain('用户');
    expect(messages[0].textContent).toContain('第一');
    expect(messages[1].textContent).toContain('智能体');
    expect(messages[1].textContent).toContain('模型调用失败');
    expect(messages[1].textContent).toContain('12 tokens');
  });

  it('带工具调用的消息渲染工具执行记录，没有的不渲染', async () => {
    renderTable(true);
    const rows = await screen.findAllByTestId('conversation-row');
    await userEvent.click(rows[0]);
    await screen.findByTestId('thread-detail-drawer');

    // 夹具里 assistant 那条消息带一次失败的 tool_call（后端 dashboard_service 会给）
    const blocks = await screen.findAllByTestId('thread-tool-calls');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].textContent).toContain('search_knowledge');
    expect(blocks[0].textContent).toContain('失败');
    expect(blocks[0].textContent).toContain('知识库为空');
    expect(blocks[0].textContent).toContain('未命中');

    // 变异：把 ToolCallList 的渲染条件去掉或改成恒不渲染，这条会失败
    const messages = await screen.findAllByTestId('thread-message');
    expect(
      messages[0].querySelector('[data-testid="thread-tool-calls"]'),
    ).toBeNull();
  });

  it('抽屉关闭后不再请求详情（threadId 归位为 null）', async () => {
    renderTable(true);
    const rows = await screen.findAllByTestId('conversation-row');
    await userEvent.click(rows[0]);
    await screen.findByTestId('thread-detail-drawer');

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByTestId('thread-detail-drawer')).toBeNull(),
    );
    expect(api.detail).toHaveBeenCalledTimes(1);
  });
});
