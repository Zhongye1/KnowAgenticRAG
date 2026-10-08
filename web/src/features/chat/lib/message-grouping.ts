/**
 * 把一轮对话拆成渲染项，并在已收尾时把中间过程折叠成一行。
 *
 * 逐条对照上游 `utils/messageGrouping.js` 与 `utils/conversationProcessGrouping.js`：
 * 助手消息拆成「正文块」与「工具块」，相邻消息的工具块跨消息合并成一个组。
 */
import type { ChatToolCall } from '../api/agent-api';
import { normalizeToolCalls } from './tool-call';
import {
  parseAssistantMessageBody,
  type ConversationMessage,
} from './message-processor';

export type ConversationToolGroup = {
  type: 'tool-group';
  key: string;
  toolCalls: ChatToolCall[];
};

export type ConversationMessageItem = {
  type: 'message';
  key: string;
  message: ConversationMessage;
  sourceIndex: number;
};

export type ConversationProcessGroup = {
  type: 'process-group';
  key: string;
  items: Array<ConversationMessageItem | ConversationToolGroup>;
  messageCount: number;
  toolCallCount: number;
  durationMs: number;
};

export type ConversationItem =
  | ConversationMessageItem
  | ConversationToolGroup
  | ConversationProcessGroup;

/** 「处理过程」的展示文案；拿不到时长时退回中性说法。 */
export const formatProcessDuration = (durationMs: number): string => {
  if (!durationMs) return '处理过程';
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `耗时${minutes}分钟${seconds}秒`;
};

/** 助手消息是否有可展示的正文；只有工具调用、没有正文时不单独占一行。 */
function hasVisibleAssistantBody(message: ConversationMessage): boolean {
  if (!message || message.type !== 'ai') return true;

  const { content, reasoningContent } = parseAssistantMessageBody(message);
  return Boolean(
    content ||
      reasoningContent ||
      message.error_type ||
      (message.extra_metadata as { error_type?: string } | null)?.error_type ||
      message.isStoppedByUser,
  );
}

/**
 * 收尾后把最后一轮助手消息之前的中间过程折成一组。
 *
 * 只有「最后的助手消息就是整轮最后一项、且中间全是助手消息与工具块」时才折叠，
 * 否则保持原样，避免把用户消息或未收尾的会话藏起来。
 */
export function collapseConversationProcess(
  items: ConversationItem[],
  enabled = false,
): ConversationItem[] {
  if (!enabled) return items;

  const finalIndex = items.findLastIndex(
    (item) => item.type === 'message' && item.message?.type === 'ai',
  );
  if (finalIndex <= 1 || finalIndex !== items.length - 1) return items;

  const processStart = items.findIndex(
    (item, index) =>
      index < finalIndex &&
      (item.type === 'tool-group' ||
        (item.type === 'message' && item.message?.type === 'ai')),
  );
  if (processStart < 0) return items;

  const slice = items.slice(processStart, finalIndex);
  // 已经折叠过的项不再套一层：与上游一致，遇到非 message / tool-group 就整体放弃
  if (
    slice.some(
      (item) =>
        item.type === 'process-group' ||
        (item.type === 'message' && item.message.type !== 'ai'),
    )
  ) {
    return items;
  }
  const processItems = slice as Array<
    ConversationMessageItem | ConversationToolGroup
  >;

  const messageCount = processItems.filter((item) => item.type === 'message').length;
  const toolCallCount = processItems.reduce(
    (count, item) => count + (item.type === 'tool-group' ? item.toolCalls.length : 0),
    0,
  );
  if (!messageCount && !toolCallCount) return items;

  const finalMessage = (items[finalIndex] as ConversationMessageItem).message;
  const startedAt = Date.parse(finalMessage?.run_started_at || '');
  const finishedAt = Date.parse(
    finalMessage?.run_finished_at || finalMessage?.created_at || '',
  );
  const durationMs =
    Number.isFinite(startedAt) && Number.isFinite(finishedAt) && finishedAt > startedAt
      ? finishedAt - startedAt
      : 0;

  return [
    ...items.slice(0, processStart),
    {
      type: 'process-group',
      key: `process-group-${processItems[0]!.key}`,
      items: processItems,
      messageCount,
      toolCallCount,
      durationMs,
    },
    items[finalIndex]!,
  ];
}

/** 把一轮对话的消息拆成渲染项，可选地折叠中间过程。 */
export function getConversationDisplayItems(
  messages: ConversationMessage[] | null | undefined,
  { collapseIntermediate = false }: { collapseIntermediate?: boolean } = {},
): ConversationItem[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const items: ConversationItem[] = [];
  let pendingToolGroup: ConversationToolGroup | null = null;

  const flushToolGroup = () => {
    if (pendingToolGroup && pendingToolGroup.toolCalls.length > 0) {
      items.push(pendingToolGroup);
    }
    pendingToolGroup = null;
  };

  messages.forEach((message, index) => {
    if (message.type !== 'ai') {
      flushToolGroup();
      items.push({
        type: 'message',
        key: String(message.id ?? `message-${index}`),
        message,
        sourceIndex: index,
      });
      return;
    }

    if (hasVisibleAssistantBody(message)) {
      flushToolGroup();
      items.push({
        type: 'message',
        key: String(message.id ?? `message-${index}`),
        message,
        sourceIndex: index,
      });
    }

    const toolCalls = normalizeToolCalls(message.tool_calls);
    if (toolCalls.length === 0) return;

    if (!pendingToolGroup) {
      pendingToolGroup = {
        type: 'tool-group',
        key: `tool-group-${message.id ?? index}`,
        toolCalls: [],
      };
    }
    pendingToolGroup.toolCalls.push(...toolCalls);
  });

  flushToolGroup();
  return collapseConversationProcess(items, collapseIntermediate);
}
