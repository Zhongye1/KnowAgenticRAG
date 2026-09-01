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
          path: paths.app.users.path,
          handle: { title: 'Users' },
          lazy: () => import('./routes/app/users').then(convert(queryClient)),
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
              lazy: () =>
                import('./routes/app/knowledge/kg').then(convert(queryClient)),
            },
            {
              path: paths.app.knowledge.skills.path,
              handle: { title: '技能' },
              lazy: () =>
                import('./routes/app/knowledge/skills').then(
                  convert(queryClient),
                ),
            },
            {
              path: paths.app.knowledge.tools.path,
              handle: { title: '工具' },
              lazy: () =>
                import('./routes/app/knowledge/tools').then(
                  convert(queryClient),
                ),
            },
            {
              path: paths.app.knowledge.mcp.path,
              handle: { title: 'MCP' },
              lazy: () =>
                import('./routes/app/knowledge/mcp').then(convert(queryClient)),
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
