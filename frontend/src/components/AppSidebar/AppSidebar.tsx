'use client';

import * as React from 'react';
import {
  Bot,
  Send,
  LibraryBig,
  MessageSquarePlus,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useLocation } from 'react-router';

import { paths } from '@/config/paths';
import { useLogout, useUser } from '@/lib/auth';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

import { NavConversations } from '../Navbars/nav-conversations';
import { NavUser } from '../Navbars/nav-users';

const NAV_TABS = [
  {
    title: '新建对话',
    url: paths.app.chat.getHref(),
    icon: MessageSquarePlus,
  },
  { title: '智能体', url: paths.app.agents.getHref(), icon: Bot },
  { title: '个人空间', url: paths.app.space.getHref(), icon: UserRound },
  {
    title: '知识库/技能',
    url: paths.app.knowledge.getHref(),
    icon: LibraryBig,
  },
  {
    title: '数据总览',
    url: paths.app.overview.getHref(),
    icon: Send,
  },
] as const;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation();
  const user = useUser();
  const logout = useLogout();

  const userName = user.data
    ? `${user.data.firstName} ${user.data.lastName}`.trim()
    : '';

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href={paths.app.dashboard.getHref()}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Sparkles className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">RAGF</span>
                  <span className="truncate text-xs">Knowledge RAG</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV_TABS.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.url}
                  tooltip={item.title}
                >
                  <a href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <NavConversations />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: userName || '未登录',
            email: user.data?.email ?? '',
          }}
          onLogout={() => logout.mutate(undefined)}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
