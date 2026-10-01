import * as React from 'react';
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
} from 'react-router';

import { DashboardLayout } from '@/app/layouts/app-shell';
import { PagePlaceholder } from '@/shared/ui/page-placeholder';
import { NavBar } from '@/widgets/intro-navbar';
import { paths } from '@/shared/config';
import { useIsSuperuser } from '@/entities/session';

import { ProtectedRoute } from './protected-route';

/** 空白布局：首页与鉴权流程不套后台外壳。 */
const BlankLayout = () => <Outlet />;

/** 首页：带顶部导航的落地页。 */
const HomeRoute = () => (
  <>
    <NavBar />
    <PagePlaceholder title="首页" />
  </>
);

/** 后台外壳：侧边栏 + 顶栏，所有登录后的页面共用。 */
const AppLayout = () => (
  <DashboardLayout>
    <Outlet />
  </DashboardLayout>
);

/** 超管专属区域的体验级守卫；后端权限才是授权边界。 */
const RequireSuperuser = () => {
  const isSuperuser = useIsSuperuser();
  return isSuperuser ? <Outlet /> : <Navigate to={paths.app.chat.getHref()} replace />;
};

const loginRoute = async () => {
  const { LoginPage } = await import('@/pages/login');
  return { Component: LoginPage };
};

const chatRoute = async () => {
  const { ChatPage } = await import('@/pages/chat');
  return { Component: ChatPage };
};

const router = createBrowserRouter([
  {
    path: paths.home.path,
    element: <BlankLayout />,
    children: [
      { index: true, element: <HomeRoute /> },
    ],
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
                element: <PagePlaceholder title="数据总览" />,
              },
            ],
          },
          {
            path: paths.app.agentManage.path,
            element: <PagePlaceholder title="智能体管理" />,
          },
          {
            path: paths.app.extensions.path,
            element: <PagePlaceholder title="扩展" />,
          },
          {
            path: paths.app.extensions.knowledgeBase.path,
            element: <PagePlaceholder title="知识库" />,
          },
          {
            path: paths.app.extensions.mcp.path,
            element: <PagePlaceholder title="MCP 服务" />,
          },
          {
            path: paths.app.extensions.skill.path,
            element: <PagePlaceholder title="技能" />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <PagePlaceholder title="404" description="页面不存在。" />,
  },
]);

export const AppRouter = () => {
  return <RouterProvider router={router} />;
};
