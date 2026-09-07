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
import { Link, useLocation } from 'react-router';

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
    // 携带 newThread 意图：由 ChatRuntimeProvider 消费，进入页面即开启新会话
    linkState: { newThread: true },
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

  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  const userName = user.data
    ? `${user.data.firstName} ${user.data.lastName}`.trim()
    : '';

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to={paths.app.dashboard.getHref()}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Sparkles className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">RAGF</span>
                  <span className="truncate text-xs">Knowledge RAG</span>
                </div>
              </Link>
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
                  isActive={isActive(item.url)}
                  tooltip={item.title}
                >
                  <Link
                    to={item.url}
                    state={'linkState' in item ? item.linkState : undefined}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
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
