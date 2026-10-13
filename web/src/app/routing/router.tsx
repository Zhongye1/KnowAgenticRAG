import * as React from 'react';
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from 'react-router';

import { AppShell } from '@/app/layouts/app-shell';
import { PagePlaceholder } from '@/shared/ui/page-placeholder';
import { paths } from '@/shared/config';

import { RequireKnowledgeEnabled, RequireSuperuser } from './guards';
import { ProtectedRoute } from './protected-route';

/** 空白布局：首页与鉴权流程不套后台外壳。 */
const BlankLayout = () => <Outlet />;

/** 后台外壳：导航列 + 内容区，所有登录后的页面共用。 */
const AppLayout = () => (
  <AppShell>
    <Outlet />
  </AppShell>
);

const homeRoute = async () => {
  const { HomePage } = await import('@/pages/home');
  return { Component: HomePage };
};

const loginRoute = async () => {
  const { LoginPage } = await import('@/pages/login');
  return { Component: LoginPage };
};

const chatRoute = async () => {
  const { ChatPage } = await import('@/pages/chat');
  return { Component: ChatPage };
};

const extensionsRoute = async () => {
  const { ExtensionsPage } = await import('@/pages/extensions');
  return { Component: ExtensionsPage };
};

const agentManageRoute = async () => {
  const { AgentManagePage } = await import('@/pages/agent-manage');
  return { Component: AgentManagePage };
};

const knowledgeBaseRoute = async () => {
  const { KnowledgeBasePage } = await import('@/pages/knowledge-base');
  return { Component: KnowledgeBasePage };
};

const skillDetailRoute = async () => {
  const { SkillDetailPage } = await import('@/pages/skill-detail');
  return { Component: SkillDetailPage };
};

const dashboardRoute = async () => {
  const { DashboardPage } = await import('@/pages/dashboard');
  return { Component: DashboardPage };
};

/** 路由表：导出以便按真实树形做接线回归（守卫是否真的包住对应路由）。 */
export const appRoutes: RouteObject[] = [
  {
    path: paths.home.path,
    element: <BlankLayout />,
    children: [{ index: true, lazy: homeRoute }],
  },
  {
    path: paths.auth.login.path,
    lazy: loginRoute,
  },
  {
    path: paths.auth.oidcCallback.path,
    element: <PagePlaceholder title="OIDC 回调" />,
  },
  {
    path: paths.auth.cliAuthorize.path,
    element: <PagePlaceholder title="CLI 授权" />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: paths.app.chat.path, lazy: chatRoute },
          { path: `${paths.app.chat.path}/:threadId`, lazy: chatRoute },
          {
            path: paths.app.workspace.path,
            element: <PagePlaceholder title="个人空间" />,
          },
          {
            element: <RequireSuperuser />,
            children: [
              {
                path: paths.app.dashboard.path,
                lazy: dashboardRoute,
              },
            ],
          },
          {
            path: paths.app.agentManage.path,
            lazy: agentManageRoute,
          },
          {
            path: paths.app.extensions.path,
            lazy: extensionsRoute,
          },
          {
            element: <RequireKnowledgeEnabled />,
            children: [
              {
                path: paths.app.extensions.knowledgeBase.path,
                lazy: knowledgeBaseRoute,
              },
            ],
          },
          {
            path: paths.app.extensions.mcp.path,
            element: <PagePlaceholder title="MCP 服务" />,
          },
          {
            path: paths.app.extensions.skill.path,
            lazy: skillDetailRoute,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <PagePlaceholder title="404" description="页面不存在。" />,
  },
];

const router = createBrowserRouter(appRoutes);

export const AppRouter = () => {
  return <RouterProvider router={router} />;
};
