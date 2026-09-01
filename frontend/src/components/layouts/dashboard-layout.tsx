import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import { AppSidebar } from '../AppSidebar/AppSidebar';
import { AppHeadbar } from '../AppHeadbar/AppHeadbar';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeadbar />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
