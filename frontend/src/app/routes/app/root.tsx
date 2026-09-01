import { Outlet, ScrollRestoration } from 'react-router';

import { DashboardLayout } from '@/components/layouts';
import { MainErrorFallback } from '@/components/errors/main';
import { PageTransition } from '@/components/ui/page-transition';

export const ErrorBoundary = () => <MainErrorFallback />;

const AppRoot = () => {
  return (
    <DashboardLayout>
      <PageTransition>
        <ScrollRestoration />
        <Outlet />
      </PageTransition>
    </DashboardLayout>
  );
};

export default AppRoot;
