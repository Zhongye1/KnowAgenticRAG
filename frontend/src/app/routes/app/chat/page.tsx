import { Head } from '@/components/seo';

import { ChatThread } from '@/features/chat/components/chat-thread';

export default function ChatRoute() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <Head title="知识库问答" />
      <ChatThread />
    </div>
  );
}
