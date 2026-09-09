import { Outlet, ScrollRestoration } from 'react-router';

import { DashboardLayout } from '@/components/layouts';
import { MainErrorFallback } from '@/components/errors/main';
import { PageTransition } from '@/components/ui/page-transition';
import { ChatRuntimeProvider } from '@/features/chat/lib/chat-runtime';

export const ErrorBoundary = () => <MainErrorFallback />;

const AppRoot = () => {
  return (
    <ChatRuntimeProvider>
      <DashboardLayout>
        <PageTransition className="flex min-h-0 flex-1 flex-col">
          <ScrollRestoration />
          <Outlet />
        </PageTransition>
      </DashboardLayout>
    </ChatRuntimeProvider>
  );
};

export default AppRoot;
