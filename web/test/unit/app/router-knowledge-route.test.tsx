/**
 * 路由接线回归：守卫必须真的包在路由上，而不是只在自己被单测覆盖。
 *
 * 用例跑的是 `router.tsx` 导出的真实路由表：把知识域路由从树上摘掉、或把守卫从它上面摘掉，
 * 深链都会落到对话页以外的结果（知识库页或 404），断言随之失败。
 */
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { session } = vi.hoisted(() => ({
  session: {
    knowledge: true as boolean | undefined,
    loading: false,
    superuser: true,
  },
}));

vi.mock('@/entities/session', () => ({
  useUnauthorizedReset: () => undefined,
  useUser: () => ({
    isLoading: false,
    data: { uid: 'u-1', role: 'superadmin' },
  }),
  useIsSuperuser: () => session.superuser,
  useCapabilities: () => ({
    isLoading: session.loading,
    data:
      session.knowledge === undefined
        ? undefined
        : { capabilities: { features: { knowledge: session.knowledge } } },
  }),
}));

vi.mock('@/app/layouts/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
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

const { appRoutes } = await import('@/app/routing/router');

const renderDeepLink = async () => {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: ['/extensions/knowledgebase/kb-1'],
  });
  render(<RouterProvider router={router} />);
  return router;
};

describe('知识域路由的守卫接线', () => {
  beforeEach(() => {
    session.knowledge = true;
    session.loading = false;
    session.superuser = true;
  });

  it('能力关闭时深链被守卫改道到对话页，不渲染知识库页', async () => {
    session.knowledge = false;
    const router = await renderDeepLink();

    expect(await screen.findByText('对话页')).toBeTruthy();
    expect(screen.queryByText('知识库页')).toBeNull();
    expect(router.state.location.pathname).toBe('/agent');
  });

  it('能力开启时深链停在知识库页', async () => {
    const router = await renderDeepLink();

    expect(await screen.findByText('知识库页')).toBeTruthy();
    expect(router.state.location.pathname).toBe(
      '/extensions/knowledgebase/kb-1',
    );
  });

  it('投影未取到时停在加载态，不改道也不渲染页面', async () => {
    session.knowledge = undefined;
    session.loading = true;
    const router = await renderDeepLink();

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.queryByText('知识库页')).toBeNull();
    expect(router.state.location.pathname).toBe(
      '/extensions/knowledgebase/kb-1',
    );
  });
});
