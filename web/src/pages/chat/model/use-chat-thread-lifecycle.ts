/**
 * 对话页的线程生命周期副作用。
 *
 * 挂载时确保默认智能体；进入线程时标记已读并加载权威历史（加载完强制滚底）；
 * 按当前智能体同步排队事件流；离开线程（切线程或卸载）时断开它的事件流。
 * 运行时实例由页面装配，这里只编排“什么时候调它”，返回值不参与渲染。
 */
import * as React from 'react';

import type { ChatRuntime } from '@/features/chat';

export type ChatThreadLifecycleOptions = {
  threadId?: string;
  agentSlug?: string;
  chat: ChatRuntime;
  ensureAgentSlug: () => Promise<unknown> | void;
  markThreadViewed: (threadId: string) => void;
  scrollToBottomStaticForce: () => void;
  notify: (notice: { type: 'error'; title: string; message: string }) => void;
};

export const useChatThreadLifecycle = (options: ChatThreadLifecycleOptions) => {
  const {
    threadId,
    agentSlug,
    chat,
    ensureAgentSlug,
    markThreadViewed,
    scrollToBottomStaticForce,
    notify,
  } = options;

  React.useEffect(() => {
    // 挂载时确保默认智能体：会话列表 store 与对话页必须指向同一个
    void ensureAgentSlug();
  }, [ensureAgentSlug]);

  React.useEffect(() => {
    if (!threadId) return;
    // 打开线程即已读：失败只记录，不影响阅读
    void markThreadViewed(threadId);
    void chat
      .loadHistory(threadId)
      .then(() => {
        // 切线程加载完历史强制滚到底并恢复自动跟滚
        scrollToBottomStaticForce();
      })
      .catch(() => {
        notify({
          type: 'error',
          title: '对话',
          message: '加载对话历史失败。',
        });
      });
  }, [chat, markThreadViewed, notify, scrollToBottomStaticForce, threadId]);

  React.useEffect(() => {
    // 线程还不存在时没有队列可同步，避免在新建对话入口刷出误导提示
    if (!agentSlug || !threadId) return;
    void chat.refreshQueue(threadId, agentSlug);
  }, [agentSlug, chat, threadId]);

  React.useEffect(() => {
    // 离开线程（切线程或卸载）时断开它的排队事件流；回到线程时队列同步会重新订阅
    if (!threadId) return;
    return () => chat.stopRequestStreams(threadId);
  }, [chat, threadId]);
};
