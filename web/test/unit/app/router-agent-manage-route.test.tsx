/**
 * 路由接线回归：`/agent-manage` 必须挂着真实页面，而不是占位。
 *
 * 用例跑 `router.tsx` 导出的真实路由表；把路由改回 `PagePlaceholder` 时断言失败。
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
  DashboardLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/widgets/intro-navbar', () => ({ NavBar: () => null }));
vi.mock('@/pages/chat', () => ({ ChatPage: () => <div>对话页</div> }));
vi.mock('@/pages/login', () => ({ LoginPage: () => <div>登录页</div> }));
vi.mock('@/pages/extensions', () => ({
  ExtensionsPage: () => <div>扩展页</div>,
}));
vi.mock('@/pages/knowledge-base', () => ({
  KnowledgeBasePage: () => <div>知识库页</div>,
}));
vi.mock('@/pages/agent-manage', () => ({
  AgentManagePage: () => <div>智能体管理页</div>,
}));

const { appRoutes } = await import('@/app/routing/router');

describe('智能体管理路由接线', () => {
  it('深链渲染真实页面', async () => {
    const router = createMemoryRouter(appRoutes, {
      initialEntries: ['/agent-manage?tab=providers'],
    });
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('智能体管理页')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/agent-manage');
  });
});
