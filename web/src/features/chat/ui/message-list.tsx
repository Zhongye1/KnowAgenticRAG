/**
 * 对话消息列表：历史按轮次分组渲染，流式消息接在最后。
 *
 * 每轮对话拆成渲染项，工具块跨消息合并，已收尾的轮次把中间过程折成一行「耗时…」。
 */
import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import type { ChatMessage } from '../api/agent-api';
import {
  formatProcessDuration,
  getConversationDisplayItems,
} from '../lib/message-grouping';
import type {
  ConversationMessageItem,
  ConversationToolGroup,
} from '../lib/message-grouping';
import type {
  Conversation,
  ConversationMessage,
} from '../lib/message-processor';
import { toConversations } from '../lib/message-processor';
import { MessageItem } from './message-item';
import { ToolCallsGroup } from './tool-calls-group';

type MessageListProps = {
  /** 权威历史。 */
  messages: ChatMessage[];
  /** 正在流式输出的消息；没有时为空数组。 */
  streamingMessages?: ConversationMessage[];
  /** 是否正在处理，用于让最后一组工具保持展开。 */
  isProcessing?: boolean;
};

/** 已收尾的轮次把中间过程折成一行，正在输出的轮次保持展开。 */
type ProcessGroupItem = ConversationMessageItem | ConversationToolGroup;

const ProcessGroup = ({
  items,
  durationMs,
}: {
  items: ProcessGroupItem[];
  durationMs: number;
}) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <section className="flex flex-col">
      <button
        type="button"
        className="flex w-fit items-center gap-1 border-b border-color-border-1 py-1 text-xs text-color-text-3"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{formatProcessDuration(durationMs)}</span>
        <ChevronDown
          className={`size-4 transition-transform ${expanded ? '' : '-rotate-90'}`}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="flex flex-col gap-2 py-2">
          {items.map((item) =>
            item.type === 'message' ? (
              <MessageItem key={item.key} message={item.message} />
            ) : (
              <ToolCallsGroup key={item.key} toolCalls={item.toolCalls} />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
};

export const MessageList = ({
  messages,
  streamingMessages = [],
  isProcessing = false,
}: MessageListProps) => {
  // 流式分片是就地追加的，不能缓存：每次渲染都重新拼一次
  const conversations: Conversation[] = [
    ...toConversations(messages),
    ...(streamingMessages.length > 0
      ? [{ messages: streamingMessages, status: 'streaming' as const }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {conversations.length === 0 ? (
        <p className="text-sm text-color-text-3">还没有消息，发送一条试试。</p>
      ) : null}

      {conversations.map((conversation, conversationIndex) => {
        const isLast = conversationIndex === conversations.length - 1;
        // 这一轮不是正在输出的那一轮，且它已经收尾（后面还有一轮，
        // 或整体已经不再处理）时才把中间过程折起来
        const settled = !isLast || !isProcessing;
        const displayItems = getConversationDisplayItems(
          conversation.messages,
          {
            collapseIntermediate:
              conversation.status !== 'streaming' && settled,
          },
        );
        return (
          <div
            key={`conv-${conversationIndex}`}
            className="flex flex-col gap-2"
            data-testid="conversation"
          >
            {displayItems.map((item, itemIndex) =>
              item.type === 'message' ? (
                <MessageItem
                  key={item.key}
                  message={item.message}
                  isProcessing={
                    isProcessing &&
                    conversationIndex === conversations.length - 1 &&
                    item.sourceIndex === conversation.messages.length - 1
                  }
                />
              ) : item.type === 'tool-group' ? (
                <ToolCallsGroup
                  key={item.key}
                  toolCalls={item.toolCalls}
                  isActive={
                    isProcessing &&
                    conversationIndex === conversations.length - 1 &&
                    itemIndex === displayItems.length - 1
                  }
                />
              ) : (
                <ProcessGroup
                  key={item.key}
                  items={item.items}
                  durationMs={item.durationMs}
                />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
};
