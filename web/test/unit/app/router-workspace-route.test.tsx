/**
 * 路由接线回归：`/workspace` 必须挂着真实页面，而不是占位。
 *
 * 用例跑 `router.tsx` 导出的真实路由表；把路由改回 `PagePlaceholder` 时断言失败。
 * 页面本身的行为在 `test/unit/pages/workspace-page.test.tsx`，这里只验接线。
 */
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/entities/session', () => ({
  useUnauthorizedReset: () => undefined,
  useUser: () => ({
    isLoading: false,
    data: { uid: 'u-1', role: 'superadmin' },
  }),
  useIsSuperuser: () => true,
  useCapabilities: () => ({
    isLoading: false,
    data: { capabilities: { features: { knowledge: true } } },
  }),
}));

vi.mock('@/app/layouts/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/pages/chat', () => ({ ChatPage: () => <div>对话页</div> }));
vi.mock('@/pages/login', () => ({ LoginPage: () => <div>登录页</div> }));
vi.mock('@/pages/extensions', () => ({
  ExtensionsPage: () => <div>扩展页</div>,
}));
vi.mock('@/pages/agent-manage', () => ({
  AgentManagePage: () => <div>智能体管理页</div>,
}));
vi.mock('@/pages/dashboard', () => ({
  DashboardPage: () => <div>数据总览页</div>,
}));
vi.mock('@/pages/workspace', () => ({
  WorkspacePage: () => <div>个人空间页</div>,
}));

const { appRoutes } = await import('@/app/routing/router');

describe('个人空间路由接线', () => {
  it('深链渲染真实页面而不是占位', async () => {
    const router = createMemoryRouter(appRoutes, {
      initialEntries: ['/workspace'],
    });
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('个人空间页')).toBeTruthy();
    expect(screen.queryByText('页面建设中，敬请期待。')).toBeNull();
    expect(router.state.location.pathname).toBe('/workspace');
  });
});
