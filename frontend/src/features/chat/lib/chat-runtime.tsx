import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { useEffect, type PropsWithChildren } from 'react';
import { useLocation } from 'react-router';

import { chatAdapter } from './chat-adapter';

/**
 * 问答 runtime 挂在应用根（侧边栏"最近对话"与聊天页共享同一 runtime）。
 * 侧边栏"新建对话"通过路由 state 携带 newThread 意图，在这里消费并切换新线程。
 */
export function ChatRuntimeProvider({ children }: PropsWithChildren) {
  const runtime = useLocalRuntime(chatAdapter);
  const location = useLocation();

  useEffect(() => {
    const state = location.state as { newThread?: boolean } | null;
    if (!state?.newThread) return;
    runtime.threads.switchToNewThread();
    // 清掉意图标记，避免刷新/前进后退时重复新建
    window.history.replaceState(null, '');
  }, [location, runtime]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
