'use client';

import * as React from 'react';
import {
  Bot,
  LayoutGrid,
  LibraryBig,
  MessageSquarePlus,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { paths } from '@/shared/config';
import { useIsSuperuser, useLogout, useUser } from '@/entities/session';
import { useKnowledgeEnabled } from '@/entities/session';
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
} from '@/shared/ui/sidebar';

import { NavUser } from './user-menu';

const NAV_TABS = [
  { title: '新建对话', url: paths.app.chat.getHref(), icon: MessageSquarePlus },
  { title: '个人空间', url: paths.app.workspace.getHref(), icon: UserRound },
  { title: '智能体管理', url: paths.app.agentManage.getHref(), icon: Bot },
] as const;

const EXTENSIONS_TAB = {
  title: '扩展',
  url: paths.app.extensions.getHref(),
  icon: LibraryBig,
} as const;

// 数据总览入口与业务导航分开声明，便于按角色拼接
const DASHBOARD_TAB = {
  title: '数据总览',
  url: paths.app.dashboard.getHref(),
  icon: LayoutGrid,
} as const;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation();
  const user = useUser();
  const logout = useLogout();
  const knowledgeEnabled = useKnowledgeEnabled();

  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  const navTabs = [
    ...NAV_TABS,
    // LITE 模式不注册知识域路由，入口随之隐藏；取不到投影时按可用处理，避免首屏闪烁
    ...(knowledgeEnabled === false ? [] : [EXTENSIONS_TAB]),
    // 数据总览入口只对超管展示（体验级约束，后端权限才是边界）
    ...(useIsSuperuser() ? [DASHBOARD_TAB] : []),
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to={paths.home.getHref()}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Sparkles className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">ARS</span>
                  <span className="truncate text-xs">知识智能体平台</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navTabs.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive(item.url)}
                  tooltip={item.title}
                >
                  <Link to={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: user.data?.username ?? '未登录',
            email: user.data?.department_name ?? '',
          }}
          onLogout={() => logout.mutate(undefined)}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
