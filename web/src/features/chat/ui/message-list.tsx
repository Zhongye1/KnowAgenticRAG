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
import styles from './message-list.module.css';

type MessageListProps = {
  /** 权威历史。 */
  messages: ChatMessage[];
  /** 正在流式输出的消息；没有时为空数组。 */
  streamingMessages?: ConversationMessage[];
  /** 是否正在处理，用于让最后一组工具保持展开。 */
  isProcessing?: boolean;
  /** 透传给工具行；见 `ToolCallRow`。 */
  resolveKbName?: (kbId: string) => string;
  /** 产物卡片；由页面提供动作（预览、下载、保存），不传则不渲染。 */
  renderArtifacts?: (conversation: Conversation) => React.ReactNode;
};

/** 已收尾的轮次把中间过程折成一行，正在输出的轮次保持展开。 */
type ProcessGroupItem = ConversationMessageItem | ConversationToolGroup;

const ProcessGroup = ({
  items,
  durationMs,
  resolveKbName,
}: {
  items: ProcessGroupItem[];
  durationMs: number;
  resolveKbName?: (kbId: string) => string;
}) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <section className="flex flex-col">
      <button
        type="button"
        className={styles.processToggle}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{formatProcessDuration(durationMs)}</span>
        <ChevronDown
          className={`${styles.processChevron} ${expanded ? '' : styles.processChevronCollapsed}`}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className={styles.processList}>
          {items.map((item) =>
            item.type === 'message' ? (
              <MessageItem
                key={item.key}
                message={item.message}
                resolveKbName={resolveKbName}
              />
            ) : (
              <ToolCallsGroup
                key={item.key}
                toolCalls={item.toolCalls}
                resolveKbName={resolveKbName}
              />
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
  resolveKbName,
  renderArtifacts,
}: MessageListProps) => {
  // 流式分片是就地追加的，不能缓存：每次渲染都重新拼一次
  const conversations: Conversation[] = [
    ...toConversations(messages),
    ...(streamingMessages.length > 0
      ? [{ messages: streamingMessages, status: 'streaming' as const }]
      : []),
  ];

  return (
    <div className={styles.list}>
      {conversations.length === 0 ? (
        <p className={styles.empty}>暂无消息</p>
      ) : null}

      {conversations.map((conversation, conversationIndex) => {
        const isLast = conversationIndex === conversations.length - 1;
        // 这一轮不是正在输出的那一轮，且它已经收尾（后面还有一轮，
        // 或整体已经不再处理）时才把中间过程折起来
        const settled = !isLast || !isProcessing;
        // 「正在处理」只认流式那一轮：流刚起、还没产出分片时，历史消息不该被标成处理中
        const streaming = conversation.status === 'streaming';
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
            className={styles.conversation}
            data-testid="conversation"
          >
            {displayItems.map((item, itemIndex) =>
              item.type === 'message' ? (
                <MessageItem
                  key={item.key}
                  message={item.message}
                  resolveKbName={resolveKbName}
                  isProcessing={
                    isProcessing &&
                    streaming &&
                    item.sourceIndex === conversation.messages.length - 1
                  }
                />
              ) : item.type === 'tool-group' ? (
                <ToolCallsGroup
                  key={item.key}
                  toolCalls={item.toolCalls}
                  isActive={
                    isProcessing &&
                    streaming &&
                    itemIndex === displayItems.length - 1
                  }
                  resolveKbName={resolveKbName}
                />
              ) : (
                <ProcessGroup
                  key={item.key}
                  items={item.items}
                  durationMs={item.durationMs}
                  resolveKbName={resolveKbName}
                />
              ),
            )}
            {renderArtifacts?.(conversation)}
          </div>
        );
      })}
    </div>
  );
};
