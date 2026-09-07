import { useAuiState } from '@assistant-ui/react';

import { useChatRunStore } from '../stores/chat-run-store';
import type { ChatRunInfo } from '../types';

/** 在消息组件内读取本轮运行期信息（meta / citations / usage / doneReason） */
export const useChatRunInfo = (): ChatRunInfo | undefined => {
  const messageId = useAuiState((s) => s.message.id);
  return useChatRunStore((s) => (messageId ? s.runs[messageId] : undefined));
};
