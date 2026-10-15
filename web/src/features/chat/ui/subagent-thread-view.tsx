/**
 * 面板里的子智能体线程视图。
 *
 * 子线程是普通线程：复用 `MessageList` 渲染权威历史与流式消息；
 * 装载与流订阅在 `model/subagent-thread.ts`。
 */
import * as React from 'react';

import { MessageList } from './message-list';
import styles from './panel-sections.module.css';
import {
  useSubagentHistory,
  useSubagentStreamingMessages,
  useSubagentThreadMessages,
} from '../model/subagent-thread';

export type SubagentThreadViewProps = {
  /** 子线程 id。 */
  childThreadId: string;
  /** 子智能体 run id；运行中时订阅它的事件流。 */
  runId?: string;
  runStatus?: string;
  /** 分区是否激活；未激活时不拉数据也不订阅流。 */
  active: boolean;
};

export const SubagentThreadView = ({
  childThreadId,
  runId,
  runStatus,
  active,
}: SubagentThreadViewProps) => {
  const { loading, error } = useSubagentThreadMessages({
    childThreadId,
    runId,
    runStatus,
    active,
  });
  const messages = useSubagentHistory(active ? childThreadId : undefined);
  const streamingMessages = useSubagentStreamingMessages(
    active ? childThreadId : undefined,
  );
  const isStreaming = streamingMessages.length > 0;

  return (
    /* 滚动区 16px 28px 28px 内距、内容限宽 800px 居中 */
    <div className="min-h-0 flex-1 overflow-y-auto px-7 pt-4 pb-7">
      {loading && messages.length === 0 && streamingMessages.length === 0 ? (
        <p className={styles.stateEmpty}>正在加载子智能体消息...</p>
      ) : error ? (
        <p
          className={`${styles.stateEmpty} ${styles.previewError}`}
          role="alert"
        >
          {error}
        </p>
      ) : (
        <div className="mx-auto w-full max-w-[800px]">
          <MessageList
            messages={messages}
            streamingMessages={streamingMessages}
            isProcessing={isStreaming}
          />
        </div>
      )}
    </div>
  );
};
