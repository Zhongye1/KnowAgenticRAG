import { ThreadListPrimitive } from '@assistant-ui/react';
import { MessageSquarePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Head } from '@/components/seo';

import { ChatThread } from '@/features/chat/components/chat-thread';
import { KbPicker } from '@/features/chat/components/kb-picker';

export default function ChatRoute() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <Head title="知识库问答" />
      <header className="border-border/60 flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <KbPicker />
        <ThreadListPrimitive.New asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <MessageSquarePlus className="size-4" />
            新对话
          </Button>
        </ThreadListPrimitive.New>
      </header>
      <div className="min-h-0 flex-1">
        <ChatThread />
      </div>
    </div>
  );
}
