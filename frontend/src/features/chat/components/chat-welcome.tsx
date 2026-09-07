import { useAui } from '@assistant-ui/react';
import { LibraryBig } from 'lucide-react';

import { useChatSettingsStore } from '../stores/chat-settings-store';

const SUGGESTED_QUESTIONS = [
  '这个知识库主要包含哪些内容？',
  '帮我总结知识库里的关键要点',
  '知识库中有哪些核心概念？',
];

/** 空会话欢迎态：选择知识库的引导 + 建议问题 */
export const ChatWelcome = () => {
  const kbName = useChatSettingsStore((s) => s.kbName);
  const aui = useAui();

  return (
    <div className="flex flex-col items-center px-4 text-center">
      <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-2xl">
        <LibraryBig className="size-6" />
      </div>
      <h1 className="mt-4 text-2xl font-medium tracking-tight">知识库问答</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {kbName
          ? '基于所选知识库检索并生成带引用来源的回答'
          : '请先在下方选择要问答的知识库'}
      </p>
      <div className="mt-6 flex w-full flex-wrap items-center justify-center gap-2">
        {SUGGESTED_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            disabled={!kbName}
            onClick={() =>
              aui.thread.append({
                role: 'user',
                content: [{ type: 'text', text: question }],
              })
            }
            className="border-border/60 hover:bg-muted text-foreground h-auto cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
};
