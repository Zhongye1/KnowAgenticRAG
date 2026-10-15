/**
 * 智能体管理页的页头与接线。
 *
 * 模型供应商 tab 只对管理员可见（体验级约束，授权在后端 `get_admin_user`）；深链
 * `?tab=providers` 在非管理员下必须落回智能体 tab。页头统计芯片与面板读同一份缓存，
 * 这里只验证渲染出来的四个数。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { session, selectAgent, state } = vi.hoisted(() => ({
  session: { role: 'admin' as string | undefined },
  selectAgent: vi.fn(),
  state: { agents: [] as unknown[] },
}));

vi.mock('@/entities/session', () => ({
  useUser: () => ({ data: session.role ? { role: session.role } : undefined }),
}));

vi.mock('@/entities/agent', async () => {
  const actual =
    await vi.importActual<typeof import('@/entities/agent')>(
      '@/entities/agent',
    );
  return {
    ...actual,
    useAgents: () => ({
      agents: actual.toAgents(state.agents),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
  };
});

vi.mock('@/features/model-providers', () => ({
  ModelProviderPanel: () => <div>供应商面板</div>,
}));

vi.mock('@/features/agents', async () => {
  const actual =
    await vi.importActual<typeof import('@/features/agents')>(
      '@/features/agents',
    );
  return {
    ...actual,
    AgentManagePanel: ({
      onOpenChat,
    }: {
      onOpenChat: (agent: { slug: string; name: string }) => void;
    }) => (
      <button
        type="button"
        onClick={() => onOpenChat({ slug: 'alpha', name: '甲' })}
      >
        开对话
      </button>
    ),
  };
});

vi.mock('@/features/chat', () => ({
  useThreadList: (
    selector: (store: { selectAgent: typeof selectAgent }) => unknown,
  ) => selector({ selectAgent }),
}));

const { AgentManagePage } = await import('@/pages/agent-manage');

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
};

const renderPage = (initialEntry = '/agent-manage') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AgentManagePage />
      <LocationProbe />
    </MemoryRouter>,
  );

describe('智能体管理页', () => {
  beforeEach(() => {
    session.role = 'admin';
    selectAgent.mockClear();
    state.agents = [
      {
        slug: 'alpha',
        name: '甲',
        is_builtin: true,
        can_manage: true,
        share_config: { read_scope: { access_level: 'global' } },
      },
      { slug: 'beta', name: '乙' },
    ];
  });

  it('页头有标题、两个 tab 与四个统计芯片', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: '智能体管理' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: '智能体' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '模型供应商' })).toBeTruthy();
    expect(screen.getByText('2 个智能体')).toBeTruthy();
    expect(screen.getByText('1 个全局')).toBeTruthy();
    expect(screen.getByText('1 个内置')).toBeTruthy();
    expect(screen.getByText('1 个可管理')).toBeTruthy();
  });

  it('模型供应商 tab 上不显示智能体统计', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: '模型供应商' }));

    expect(await screen.findByText('供应商面板')).toBeTruthy();
    expect(screen.queryByText('2 个智能体')).toBeNull();
  });

  it('点击模型供应商 tab 渲染面板', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '模型供应商' }));
    expect(await screen.findByText('供应商面板')).toBeTruthy();
  });

  it('深链 ?tab=providers 直接打开供应商面板', () => {
    renderPage('/agent-manage?tab=providers');
    expect(screen.getByText('供应商面板')).toBeTruthy();
  });

  it('普通用户没有供应商 tab，深链也会落回智能体', () => {
    session.role = 'user';
    renderPage('/agent-manage?tab=providers');
    // 变异：去掉 tabs 包含判定，深链会让普通用户看到供应商面板
    expect(screen.queryByText('供应商面板')).toBeNull();
    expect(screen.queryByRole('button', { name: '模型供应商' })).toBeNull();
    expect(screen.getByRole('button', { name: '开对话' })).toBeTruthy();
  });

  it('「去对话」先选中智能体再跳对话页', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: '开对话' }));

    expect(selectAgent).toHaveBeenCalledWith('alpha');
    expect(screen.getByTestId('location').textContent).toBe('/agent');
  });
});
