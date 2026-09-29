import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { paths } from '@/config/paths';
import { ProtectedRoute } from '@/lib/auth';

import {
  default as AppRoot,
  ErrorBoundary as AppRootErrorBoundary,
} from './routes/app/root';

const convert = (queryClient: QueryClient) => (m: any) => {
  const { clientLoader, clientAction, default: Component, ...rest } = m;
  return {
    ...rest,
    loader: clientLoader?.(queryClient),
    action: clientAction?.(queryClient),
    Component,
  };
};

export const createAppRouter = (queryClient: QueryClient) =>
  createBrowserRouter([
    {
      path: paths.home.path,
      lazy: () => import('./routes/landing').then(convert(queryClient)),
    },
    {
      path: paths.auth.login.path,
      lazy: () => import('./routes/auth').then(convert(queryClient)),
    },
    {
      path: paths.app.root.path,
      element: (
        <ProtectedRoute>
          <AppRoot />
        </ProtectedRoute>
      ),
      ErrorBoundary: AppRootErrorBoundary,
      children: [
        {
          // 旧模板页（读假接口的 fba 脚手架）已被管理面板取代；路径常量保留并指向新面板，
          // 此处再兜一层重定向，避免旧链接 404
          path: paths.app.users.path,
          element: <Navigate to={paths.app.admin.users.getHref()} replace />,
        },
        {
          path: paths.app.admin.path,
          handle: { title: '管理面板' },
          lazy: () => import('./routes/app/admin/root').then(convert(queryClient)),
          children: [
            {
              index: true,
              element: <Navigate to={paths.app.admin.users.getHref()} replace />,
            },
            {
              path: paths.app.admin.users.path,
              handle: { title: '用户管理' },
              lazy: () =>
                import('./routes/app/admin/users').then(convert(queryClient)),
            },
            {
              path: paths.app.admin.depts.path,
              handle: { title: '部门管理' },
              lazy: () =>
                import('./routes/app/admin/depts').then(convert(queryClient)),
            },
            {
              path: paths.app.admin.roles.path,
              handle: { title: '角色管理' },
              lazy: () =>
                import('./routes/app/admin/roles').then(convert(queryClient)),
            },
            {
              path: paths.app.admin.kbAcl.path,
              handle: { title: '知识库授权' },
              lazy: () =>
                import('./routes/app/admin/kb-acl').then(convert(queryClient)),
            },
          ],
        },
        {
          path: paths.app.profile.path,
          handle: { title: 'Profile' },
          lazy: () => import('./routes/app/profile').then(convert(queryClient)),
        },
        {
          path: paths.app.dashboard.path,
          handle: { title: 'Dashboard' },
          lazy: () =>
            import('./routes/app/dashboard/page').then(convert(queryClient)),
        },
        {
          path: paths.app.chat.path,
          handle: { title: '新建对话' },
          lazy: () =>
            import('./routes/app/chat/page').then(convert(queryClient)),
        },
        {
          path: paths.app.agents.path,
          handle: { title: '智能体' },
          lazy: () =>
            import('./routes/app/agents/page').then(convert(queryClient)),
        },
        {
          path: paths.app.space.path,
          handle: { title: '个人空间' },
          lazy: () =>
            import('./routes/app/space/page').then(convert(queryClient)),
        },
        {
          path: paths.app.knowledge.path,
          handle: { title: '知识库/技能' },
          lazy: () =>
            import('./routes/app/knowledge/page').then(convert(queryClient)),
          children: [
            {
              index: true,
              element: (
                <Navigate to={paths.app.knowledge.kg.getHref()} replace />
              ),
            },
            {
              path: paths.app.knowledge.kg.path,
              handle: { title: '知识库' },
              children: [
                {
                  index: true,
                  lazy: () =>
                    import('./routes/app/knowledge/kg/page').then(
                      convert(queryClient),
                    ),
                },
                {
                  path: paths.app.knowledge.kg.detail.path,
                  handle: { title: '知识库文档' },
                  lazy: () =>
                    import('./routes/app/knowledge/kg/[kbName]/page').then(
                      convert(queryClient),
                    ),
                },
              ],
            },
            {
              path: paths.app.knowledge.skills.path,
              handle: { title: '技能' },
              lazy: () =>
                import('./routes/app/knowledge/skills/page').then(
                  convert(queryClient),
                ),
            },
            {
              path: paths.app.knowledge.tools.path,
              handle: { title: '工具' },
              lazy: () =>
                import('./routes/app/knowledge/tools/page').then(
                  convert(queryClient),
                ),
            },
            {
              path: paths.app.knowledge.mcp.path,
              handle: { title: 'MCP' },
              lazy: () =>
                import('./routes/app/knowledge/mcp/page').then(
                  convert(queryClient),
                ),
            },
          ],
        },
        {
          path: paths.app.overview.path,
          handle: { title: '数据总览' },
          lazy: () =>
            import('./routes/app/overview/page').then(convert(queryClient)),
        },
      ],
    },
    {
      path: '*',
      lazy: () => import('./routes/not-found').then(convert(queryClient)),
    },
  ]);

export const AppRouter = () => {
  const queryClient = useQueryClient();

  const router = useMemo(() => createAppRouter(queryClient), [queryClient]);

  return <RouterProvider router={router} />;
};
