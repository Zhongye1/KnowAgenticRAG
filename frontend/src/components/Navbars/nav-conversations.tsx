'use client';

import { ThreadListItemPrimitive, ThreadListPrimitive } from '@assistant-ui/react';
import { MessageSquare, MessageSquarePlus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';

import { paths } from '@/config/paths';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

/**
 * 侧边栏"最近对话"：直接消费问答 runtime 的线程列表（会话内存态，刷新后清空）。
 */
export function NavConversations() {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>最近对话</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <ThreadListPrimitive.New asChild>
            <SidebarMenuButton tooltip="开启新对话">
              <MessageSquarePlus />
              <span>开启新对话</span>
            </SidebarMenuButton>
          </ThreadListPrimitive.New>
        </SidebarMenuItem>
        <ThreadListPrimitive.Items>
          {() => <ConversationItem />}
        </ThreadListPrimitive.Items>
      </SidebarMenu>
    </SidebarGroup>
  );
}

const ConversationItem = () => {
  const navigate = useNavigate();

  return (
    <SidebarMenuItem>
      <ThreadListItemPrimitive.Root className="group/tli relative">
        <ThreadListItemPrimitive.Trigger asChild>
          <SidebarMenuButton
            onClick={() => navigate(paths.app.chat.getHref())}
            className="group-data-[active=true]/tli:bg-sidebar-accent group-data-[active=true]/tli:text-sidebar-accent-foreground w-full"
          >
            <MessageSquare />
            <span className="truncate">
              <ThreadListItemPrimitive.Title fallback="新对话" />
            </span>
          </SidebarMenuButton>
        </ThreadListItemPrimitive.Trigger>
        <ThreadListItemPrimitive.Delete asChild>
          <SidebarMenuAction
            aria-label="删除对话"
            className="text-muted-foreground hover:text-danger-6 opacity-0 transition-opacity group-hover/tli:opacity-100"
          >
            <Trash2 />
          </SidebarMenuAction>
        </ThreadListItemPrimitive.Delete>
      </ThreadListItemPrimitive.Root>
    </SidebarMenuItem>
  );
};
