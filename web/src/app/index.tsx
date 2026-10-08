import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import * as React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { HelmetProvider } from 'react-helmet-async';

import { queryConfig } from '@/shared/lib';
import { ConfirmDialogHost } from '@/shared/ui/confirm-dialog-host';
import { Notifications } from '@/shared/ui/notifications';
import { Spinner } from '@/shared/ui/spinner';
import { MainErrorFallback } from '@/shared/ui/error-fallback';

import { AppRouter } from './routing/router';

/**
 * 应用外壳：装配全局 provider（查询客户端、错误边界、head 管理、通知中心、命令式确认框）。
 */
const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: queryConfig,
      }),
  );

  return (
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
            <Notifications />
            <ConfirmDialogHost />
            {children}
          </QueryClientProvider>
        </HelmetProvider>
      </ErrorBoundary>
    </React.Suspense>
  );
};

export const App = () => {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  );
};
