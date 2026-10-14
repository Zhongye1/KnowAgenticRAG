import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import * as React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';

import { queryConfig } from '@/shared/lib';
import { Spinner } from '@/shared/ui/spinner';
import { MainErrorFallback } from '@/shared/ui/error-fallback';

import { AppRouter } from './routing/router';
import { AntdProvider } from './theme/antd-provider';

/**
 * 应用外壳：装配全局 provider（antd 主题与组件基座、查询客户端、错误边界、
 * head 管理）。通知与命令式确认框走 `AntdApp.useApp()` 的 message/modal，
 * 由 AntdProvider 内的 antd App 上下文承载。
 */
const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: queryConfig,
      }),
  );

  return (
    <AntdProvider>
      <React.Suspense
        fallback={
          <div className="flex h-screen w-screen items-center justify-center">
            <Spinner size="xl" />
          </div>
        }
      >
        <ErrorBoundary FallbackComponent={MainErrorFallback}>
          <HelmetProvider>
            <QueryClientProvider client={queryClient}>
              {import.meta.env.DEV && <ReactQueryDevtools />}
              {children}
            </QueryClientProvider>
          </HelmetProvider>
        </ErrorBoundary>
      </React.Suspense>
    </AntdProvider>
  );
};

export const App = () => {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  );
};
