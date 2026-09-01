import { Outlet } from 'react-router';

// import { DashboardLayout } from '@/components/layouts';
import { PageTransition } from '@/components/ui/page-transition';

export const ErrorBoundary = () => {
  return <div>Something went wrong!</div>;
};

const AppRoot = () => {
  return (
    // <DashboardLayout>
    <PageTransition>
      <Outlet />
    </PageTransition>
    // </DashboardLayout>
  );
};

export default AppRoot;
