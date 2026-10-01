import { SidebarInset, SidebarProvider } from '@/shared/ui/sidebar';

import { AppSidebar } from '@/widgets/app-sidebar';
import { AppHeadbar } from '@/widgets/app-headbar';

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
