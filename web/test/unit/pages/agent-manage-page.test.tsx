/**
 * 智能体管理页的 tab 判定。
 *
 * 模型供应商 tab 只对管理员可见（体验级约束，授权在后端 `get_admin_user`）；
 * 深链 `?tab=providers` 在非管理员下必须落回智能体 tab，不能渲染供应商面板。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { session } = vi.hoisted(() => ({
  session: { role: 'admin' as string | undefined },
}));

vi.mock('@/entities/session', () => ({
  useUser: () => ({ data: session.role ? { role: session.role } : undefined }),
}));

vi.mock('@/features/model-providers', () => ({
  ModelProviderPanel: () => <div>供应商面板</div>,
}));

const { AgentManagePage } = await import('@/pages/agent-manage');

const renderPage = (initialEntry = '/agent-manage') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AgentManagePage />
    </MemoryRouter>,
  );

describe('智能体管理页', () => {
  beforeEach(() => {
    session.role = 'admin';
  });

  it('管理员看到两个 tab，默认停在智能体', () => {
    renderPage();
    expect(screen.getByRole('button', { name: '智能体' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '模型供应商' })).toBeTruthy();
    expect(screen.queryByText('供应商面板')).toBeNull();
    expect(screen.getByText('该面板随对应分片接入。')).toBeTruthy();
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
    expect(screen.getByText('该面板随对应分片接入。')).toBeTruthy();
  });
});
