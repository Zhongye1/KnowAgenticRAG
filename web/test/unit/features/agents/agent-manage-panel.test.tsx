/**
 * 智能体面板的组件用例。
 *
 * 与模型供应商面板同口径：不 mock `entities/agent`，而是 mock 契约生成客户端，让 api 段、
 * 归一与查询层真实跑一遍——「缺标识的条目不渲染」「创建下发的是 slug 而不是自增 id」这类
 * 主张因此不是被替身绕过的。
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 20000 });

const { sdk, notifications, confirm } = vi.hoisted(() => ({
  sdk: {
    list: vi.fn(),
    backends: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
  confirm: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  listAgentsApiAgentGet: (...args: unknown[]) => sdk.list(...args),
  listAgentBackendsApiAgentBackendsGet: (...args: unknown[]) =>
    sdk.backends(...args),
  createAgentApiAgentPost: (...args: unknown[]) => sdk.create(...args),
  updateAgentApiAgentAgentIdPut: (...args: unknown[]) => sdk.update(...args),
  deleteAgentApiAgentAgentIdDelete: (...args: unknown[]) => sdk.remove(...args),
  getAgentApiAgentAgentIdGet: vi.fn(),
  uploadUserImageApiUserUploadImagePost: vi.fn(),
}));

vi.mock('@/shared/ui/notifications', () => ({
  useNotifications: () => notifications,
}));

vi.mock('@/shared/ui/confirm-dialog', () => ({
  useConfirm: () => ({ confirm }),
}));

const { AgentManagePanel } = await import('@/features/agents');
const { AntdProvider } = await import('@/app/theme/antd-provider');

const rawAgent = (extra: Record<string, unknown> = {}) => ({
  slug: 'alpha',
  name: '甲',
  description: '第一个智能体',
  backend_id: 'chatbot',
  can_manage: true,
  share_config: { version: 2, read_scope: { access_level: 'global' } },
  ...extra,
});

const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onOpenChat = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <AntdProvider>
        <AgentManagePanel onOpenChat={onOpenChat} />
      </AntdProvider>
    </QueryClientProvider>,
  );

  return { onOpenChat };
};

/** 列表与后端两个端点都备好；返回后即可渲染。 */
const ready = async (agents: unknown[]) => {
  sdk.list.mockResolvedValue({ data: { agents } });
  sdk.backends.mockResolvedValue({
    data: { backends: [{ backend_id: 'chatbot', name: '智能助手' }] },
  });
};

describe('AgentManagePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirm.mockResolvedValue(true);
  });

  it('按智能体 / 子智能体分组，空组不出现', async () => {
    await ready([
      rawAgent(),
      rawAgent({ slug: 'worker', name: '丙', is_subagent: true }),
    ]);
    renderPanel();

    expect(await screen.findByRole('heading', { name: '智能体' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '子智能体' })).toBeTruthy();
    expect(
      within(screen.getByTestId('agent-card-alpha')).getByRole('heading', {
        name: '甲',
      }),
    ).toBeTruthy();
  });

  it('卡片给出标识、描述与共享范围标签', async () => {
    await ready([rawAgent()]);
    renderPanel();

    const card = await screen.findByTestId('agent-card-alpha');
    expect(card.textContent).toContain('alpha');
    expect(card.textContent).toContain('第一个智能体');
    // 只设读范围时是「只读X」（与参照 getShareConfigLabel 同口径）
    expect(card.textContent).toContain('只读全局');
  });

  it('没有描述时给兜底文案', async () => {
    await ready([rawAgent({ description: null })]);
    renderPanel();

    expect(
      (await screen.findByTestId('agent-card-alpha')).textContent,
    ).toContain('暂无描述');
  });

  it('缺标识的条目被丢掉', async () => {
    await ready([{ name: '无标识' }, rawAgent()]);
    renderPanel();

    await screen.findByTestId('agent-card-alpha');
    expect(screen.getAllByTestId(/^agent-card-/)).toHaveLength(1);
  });

  it('搜索按名称过滤，无匹配时给专门文案', async () => {
    await ready([rawAgent(), rawAgent({ slug: 'beta', name: '乙' })]);
    renderPanel();

    await userEvent.type(await screen.findByLabelText('搜索智能体'), '乙');

    expect(screen.queryByTestId('agent-card-alpha')).toBeNull();
    expect(screen.getByTestId('agent-card-beta')).toBeTruthy();

    await userEvent.clear(screen.getByLabelText('搜索智能体'));
    await userEvent.type(screen.getByLabelText('搜索智能体'), 'zzz');
    expect(screen.getByText('没有匹配的智能体')).toBeTruthy();
  });

  it('没有智能体时给空态文案', async () => {
    await ready([]);
    renderPanel();

    expect(await screen.findByText('暂无智能体')).toBeTruthy();
  });

  it('点「去对话」把智能体交回调用方', async () => {
    await ready([rawAgent()]);
    const { onOpenChat } = renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: '用 甲 开新对话' }),
    );

    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(onOpenChat.mock.calls[0]![0]).toMatchObject({ slug: 'alpha' });
  });

  it('子智能体卡片没有「去对话」入口', async () => {
    await ready([rawAgent({ is_subagent: true })]);
    renderPanel();

    await screen.findByTestId('agent-card-alpha');
    expect(screen.queryByRole('button', { name: /开新对话/ })).toBeNull();
  });

  it('加载中给加载文案', async () => {
    sdk.list.mockReturnValue(new Promise(() => {}));
    renderPanel();

    expect(screen.getByText('正在加载智能体…')).toBeTruthy();
  });

  it('加载失败给原因与重试', async () => {
    sdk.list.mockRejectedValue(new Error('网关超时'));
    renderPanel();

    expect((await screen.findByRole('alert')).textContent).toBe('网关超时');
    // antd 的 Button 会在两个汉字之间插一个空格，按名字查要用正则
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeTruthy();
  });

  it('新增智能体：填名称与标识后创建，下发的是 slug 与 backend_id', async () => {
    await ready([rawAgent()]);
    sdk.create.mockResolvedValue({ data: { agent: rawAgent() } });
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /新增智能体/ }),
    );
    await userEvent.type(screen.getByLabelText('智能体名称'), '合同助手');
    await userEvent.type(screen.getByLabelText('智能体标识'), 'contract');
    await userEvent.type(screen.getByLabelText('智能体描述'), '审合同');
    await userEvent.click(screen.getByRole('button', { name: /创\s*建/ }));

    await waitFor(() => expect(sdk.create).toHaveBeenCalledTimes(1));
    expect(sdk.create.mock.calls[0]![0].body).toEqual({
      name: '合同助手',
      slug: 'contract',
      backend_id: 'chatbot',
      description: '审合同',
      icon: null,
    });
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('新增时名称为空不提交，并在对话框里给原因', async () => {
    await ready([rawAgent()]);
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /新增智能体/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /创\s*建/ }));

    expect(sdk.create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('请填写智能体名称');
  });

  it('卡片菜单可编辑：对话框带着当前值，保存只下发可改字段', async () => {
    await ready([rawAgent()]);
    sdk.update.mockResolvedValue({ data: { agent: rawAgent() } });
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: '甲 的更多操作' }),
    );
    await userEvent.click(await screen.findByText('编辑智能体'));

    const nameInput = (await screen.findByLabelText(
      '智能体名称',
    )) as HTMLInputElement;
    expect(nameInput.value).toBe('甲');

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '甲二');
    await userEvent.click(screen.getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => expect(sdk.update).toHaveBeenCalledTimes(1));
    expect(sdk.update.mock.calls[0]![0].path).toEqual({ agent_id: 'alpha' });
    // 标识、后端与共享范围都不在更新体里
    expect(sdk.update.mock.calls[0]![0].body).toEqual({
      name: '甲二',
      description: '第一个智能体',
      icon: null,
    });
  });

  it('卡片菜单可删除：确认后按 slug 删', async () => {
    await ready([rawAgent()]);
    sdk.remove.mockResolvedValue({ data: { success: true } });
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: '甲 的更多操作' }),
    );
    await userEvent.click(await screen.findByText('删除智能体'));

    await waitFor(() => expect(sdk.remove).toHaveBeenCalledTimes(1));
    expect(sdk.remove.mock.calls[0]![0].path).toEqual({ agent_id: 'alpha' });
  });

  it('确认框里取消则不删除', async () => {
    await ready([rawAgent()]);
    confirm.mockResolvedValue(false);
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: '甲 的更多操作' }),
    );
    await userEvent.click(await screen.findByText('删除智能体'));

    expect(sdk.remove).not.toHaveBeenCalled();
  });

  it('内置智能体的删除项禁用', async () => {
    await ready([rawAgent({ is_builtin: true })]);
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: '甲 的更多操作' }),
    );

    expect(
      (await screen.findByText('删除智能体'))
        .closest('li')
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('不可管理的卡片没有更多操作菜单', async () => {
    await ready([rawAgent({ can_manage: false })]);
    renderPanel();

    await screen.findByTestId('agent-card-alpha');
    expect(screen.queryByRole('button', { name: /更多操作/ })).toBeNull();
  });
});
