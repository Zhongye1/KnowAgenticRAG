'use client';

import * as React from 'react';
import {
  Bot,
  LayoutGrid,
  LibraryBig,
  MessageSquarePlus,
  Search,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import {
  ConversationList,
  GlobalSearchModal,
  useThreadList,
} from '@/features/chat';
import { paths } from '@/shared/config';
import { useIsSuperuser, useLogout, useUser } from '@/entities/session';
import { useKnowledgeEnabled } from '@/entities/session';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/shared/ui/sidebar';

import { NavUser } from './user-menu';

const NEW_CHAT_TAB = {
  title: '新建对话',
  url: paths.app.chat.getHref(),
  icon: MessageSquarePlus,
} as const;

const NAV_TABS = [
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

/** 与上游同节奏的低频同步：12 秒一次，折叠或页面不可见时跳过。 */
const THREAD_STATUS_SYNC_INTERVAL_MS = 12 * 1000;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId?: string }>();
  const { state: sidebarState, isMobile } = useSidebar();
  const syncStatuses = useThreadList((store) => store.syncStatuses);
  const threads = useThreadList((store) => store.threads);
  const upsertThread = useThreadList((store) => store.upsert);
  const [searchOpen, setSearchOpen] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      // 移动端的 state 只是桌面开合状态，抽屉收起不代表列表不可见
      if (sidebarState === 'collapsed' && !isMobile) return;
      void syncStatuses();
    }, THREAD_STATUS_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isMobile, sidebarState, syncStatuses]);
  const user = useUser();
  const logout = useLogout();
  const knowledgeEnabled = useKnowledgeEnabled();

  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  const navTabs = [
    NEW_CHAT_TAB,
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
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="搜索会话"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="size-4" aria-hidden />
              <span>搜索会话</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>历史会话</SidebarGroupLabel>
          <ConversationList currentThreadId={threadId} />
        </SidebarGroup>
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

      <GlobalSearchModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        recentThreads={threads}
        onSelectThread={(thread) => {
          if (!thread) {
            navigate(paths.app.chat.getHref());
            return;
          }
          // 先写回列表：跳转后侧边栏立刻能看到这条，不必等下一次拉取
          upsertThread(thread);
          navigate(paths.app.chat.getHref(thread.id));
        }}
      />

      <SidebarRail />
    </Sidebar>
  );
}
