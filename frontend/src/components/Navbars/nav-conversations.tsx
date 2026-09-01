'use client';

import { MessageSquare } from 'lucide-react';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
};

// 会话列表接口（GET /conversations）尚未接入，先以占位数据渲染
const placeholderConversations: Conversation[] = [
  { id: '1', title: 'RAG 系统架构讨论', updatedAt: '2小时前' },
  { id: '2', title: '知识库文档上传流程', updatedAt: '昨天' },
  { id: '3', title: 'Agent 工具编排设计', updatedAt: '3天前' },
  { id: '4', title: '数据总览指标口径', updatedAt: '上周' },
];

export function NavConversations({
  conversations = placeholderConversations,
}: {
  conversations?: Conversation[];
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>最近对话</SidebarGroupLabel>
      <SidebarMenu>
        {conversations.map((conversation) => (
          <SidebarMenuItem key={conversation.id}>
            <SidebarMenuButton asChild tooltip={conversation.title}>
              <button
                className="mb-2"
                type="button"
                title={conversation.title}
              >
                <MessageSquare />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-normal">
                    {conversation.title}
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    {conversation.updatedAt}
                  </span>
                </span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
