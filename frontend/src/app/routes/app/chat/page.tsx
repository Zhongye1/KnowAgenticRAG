import { Head } from '@/components/seo';

import { ChatThread } from '@/features/chat/components/chat-thread';

export default function ChatRoute() {
  return (
    // 聊天页是「全高工作台」：扣除顶部 48px 导航条后铺满可视区域，消息区内部滚动、
    // composer 常驻底部。注意不能只写 h-full：祖先链上只有 SidebarProvider 的
    // min-h-svh（下限而非上限），消息撑破一屏后整页会被内容顶高、composer 挤出视口。
    <div className="flex h-[calc(100svh-3rem)] min-h-0 w-full flex-col overflow-hidden">
      <Head title="知识库问答" />
      <ChatThread />
    </div>
  );
}
