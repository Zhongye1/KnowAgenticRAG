import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from '@assistant-ui/react';
import { useEffect, useMemo, type PropsWithChildren } from 'react';
import { useLocation } from 'react-router';

import { kbChatAdapter } from './chat-adapter';
import { chatAttachmentAdapter } from './attachment-adapter';
import { ChatThreadListAdapter } from './chat-thread-list-adapter';

/** 每线程 LocalRuntime：附随问附件 adapter（assistant-ui runtimeHook 约定） */
const useChatLocalRuntime = () =>
  useLocalRuntime(kbChatAdapter, {
    adapters: { attachments: chatAttachmentAdapter },
  });

/**
 * 问答 runtime 挂在应用根（侧边栏"最近对话"与聊天页共享同一 runtime）。
 *
 * - 自定义 RemoteThreadListAdapter：为会话自动生成标题（首条用户消息）；
 * - attachments adapter：随问文本附件（ChatTextAttachmentAdapter）；
 * - 侧边栏"新建对话"通过路由 state 携带 newThread 意图，在这里消费并切换新线程。
 */
export function ChatRuntimeProvider({ children }: PropsWithChildren) {
  // assistant-ui 的 runtimeHook 约定要求把 hook 函数作为值传入，
  // React Compiler 无法理解该模式，此组件跳过编译。
  "use no memo";
  const threadListAdapter = useMemo(() => new ChatThreadListAdapter(), []);
  const runtime = useRemoteThreadListRuntime({
    adapter: threadListAdapter,
    runtimeHook: useChatLocalRuntime,
  });
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
