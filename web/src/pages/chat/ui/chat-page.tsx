import * as React from 'react';
import { useNavigate, useParams } from 'react-router';

import {
  agentRunApi,
  describeQueue,
  isThreadWaitingForUserAction,
  PendingInterruptPanel,
  QueueBar,
  useChatRuntime,
  useThreadRuntime,
} from '@/features/chat';
import { useIsDarkMode } from '@/shared/lib';
import { paths } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { ContentLayout } from '@/shared/ui/content-layout';
import { Input } from '@/shared/ui/input';
import { Markdown } from '@/shared/ui/markdown';
import { useNotifications } from '@/shared/ui/notifications';

/** 从当前线程的流式分片里拼出尚未落库的回复文本。 */
function useStreamedText(threadId: string | undefined) {
  const runtime = useThreadRuntime(threadId);
  const chunks = runtime?.onGoingConv.msgChunks;
  return React.useMemo(() => {
    return Object.values(chunks ?? {})
      .map((parts) =>
        (parts ?? [])
          .map((part) => String((part as { content?: string })?.content ?? ''))
          .join(''),
      )
      .filter(Boolean);
  }, [chunks]);
}

/**
 * 对话页。
 *
 * 覆盖最小闭环：进入线程加载权威历史、发送消息、流式渲染回复、中止运行、
 * 排队请求的插队/取消与队列继续。地址里没有线程时，第一次发送会先建线程再跳转
 * （与上游一致），因此 `/agent` 也能直接开始对话。
 *
 * 子代理线程视图、工具调用与思考块渲染随 S2 的后续步骤补齐。
 */
export const ChatPage = () => {
  const { threadId: routeThreadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  // 线程只以地址为准，不额外记一份本地状态：`/agent` 与 `/agent/:threadId`
  // 复用同一个组件实例，任何本地副本都会在「新建对话」时串回上一条线程。
  const threadId = routeThreadId;
  // 建线程是异步的，期间用户可能离开页面或切到别的线程，此时必须放弃这次发送
  const contextRef = React.useRef({ mounted: true, threadId: routeThreadId });
  React.useEffect(() => {
    contextRef.current.threadId = routeThreadId;
  }, [routeThreadId]);
  React.useEffect(() => {
    // StrictMode 会 setup → cleanup → setup，因此挂载期间必须显式置回 true
    const context = contextRef.current;
    context.mounted = true;
    return () => {
      context.mounted = false;
    };
  }, []);
  const [input, setInput] = React.useState('');
  const [agentSlug, setAgentSlug] = React.useState<string>();
  const notifications = useNotifications();
  const isDark = useIsDarkMode();
  const runtime = useThreadRuntime(threadId);
  const streamedTexts = useStreamedText(threadId);

  const chat = useChatRuntime({
    currentAgentId: () => agentSlug,
    fetchAgentState: () => undefined,
    onNotice: (notice) =>
      notifications.addNotification({
        type: notice.level === 'error' ? 'error' : 'info',
        title: '对话',
        message: notice.message,
      }),
  });

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { agent } = await agentRunApi.getDefaultAgent();
        if (!cancelled && agent?.slug) setAgentSlug(agent.slug);
      } catch {
        // 取不到默认智能体时保持未选择状态，发送按钮保持禁用
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!threadId) return;
    void chat.loadHistory(threadId).catch(() => {
      notifications.addNotification({
        type: 'error',
        title: '对话',
        message: '加载对话历史失败。',
      });
    });
  }, [chat, threadId]);

  React.useEffect(() => {
    // 线程还不存在时没有队列可同步，避免在新建对话入口刷出误导提示
    if (!agentSlug || !threadId) return;
    void chat.refreshQueue(threadId, agentSlug);
  }, [agentSlug, chat, threadId]);

  React.useEffect(() => {
    // 离开线程（切线程或卸载）时断开它的排队事件流，与上游一致；
    // 回到线程时上面的队列同步会重新订阅。
    if (!threadId) return;
    return () => chat.stopRequestStreams(threadId);
  }, [chat, threadId]);

  const messages = runtime?.messages ?? [];
  const pendingInterrupt = (runtime?.pendingInterrupt ?? null) as
    | import('@/features/chat').PendingInterrupt
    | null;
  const isStreaming = runtime?.isStreaming ?? false;
  const queueView = describeQueue(runtime?.queueSnapshot, runtime?.queuedRequests);
  const queuedRequests = runtime?.queuedRequests ?? [];
  const queueRowContext = {
    isStreaming,
    activeRunSteerable: runtime?.activeRunSteerable ?? false,
    hasPendingSteer: queuedRequests.some(
      (request) => request.queue_policy === 'steer',
    ),
    queueStatus: runtime?.queueSnapshot?.status ?? 'idle',
  };
  const canSend = Boolean(input.trim()) && Boolean(agentSlug) && !isStreaming;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend || !agentSlug) return;
    const query = input.trim();
    const routeThreadIdAtSubmit = threadId;
    void (async () => {
      try {
        const activeThreadId =
          threadId ?? (await chat.createThread(agentSlug));
        const context = contextRef.current;
        if (!context.mounted || context.threadId !== routeThreadIdAtSubmit) {
          // 用户已经离开或切走，这次发送的目标线程不再是当前上下文
          return;
        }
        // 先把地址写到新线程：`sendMessage` 要等整段流结束才返回，
        // 期间页面只有拿到真实 threadId 才能渲染流式回复
        if (!routeThreadIdAtSubmit) {
          navigate(paths.app.chat.getHref(activeThreadId), { replace: true });
        }
        // 建线程成功后才清输入，失败时可以原样重发
        setInput('');
        await chat.sendMessage({
          threadId: activeThreadId,
          agentSlug,
          query,
        });
        await chat.refreshQueue(activeThreadId, agentSlug);
      } catch (error) {
        // 建线程或发送被后端拒绝时静默失败会让用户以为消息已发出
        notifications.addNotification({
          type: 'error',
          title: '对话',
          message: error instanceof Error ? error.message : '发送消息失败。',
        });
      }
    })();
  };

  /** 队列动作的失败原因是后端语义（如「已派发不可取消」），必须如实转达。 */
  const runQueueAction = (action: Promise<unknown>) => {
    void action.catch((error: unknown) => {
      notifications.addNotification({
        type: 'error',
        title: '队列',
        message: error instanceof Error ? error.message : '队列操作失败。',
      });
    });
  };

  const markdownTheme = isDark ? 'github-dark' : 'github-light';

  return (
    <ContentLayout title="智能体对话">
      <div className="flex flex-col gap-4 py-4">
        <div className="flex min-h-40 flex-col gap-4 rounded-large border border-color-border-1 bg-color-bg-1 p-4">
          {messages.length === 0 && streamedTexts.length === 0 ? (
            <p className="text-sm text-color-text-3">
              还没有消息，发送一条试试。
            </p>
          ) : null}

          {messages.map((message) => (
            <div key={String(message.id)} className="flex flex-col gap-1">
              <span className="text-xs text-color-text-3">
                {message.type === 'human' ? '我' : '助手'}
              </span>
              {message.type === 'human' ? (
                <p className="whitespace-pre-wrap text-sm">{message.content}</p>
              ) : (
                <Markdown
                  content={message.content}
                  theme={markdownTheme}
                  className="prose prose-sm max-w-none text-sm"
                />
              )}
              {message.error_message ? (
                <p className="text-xs text-color-danger-6">
                  {message.error_message}
                </p>
              ) : null}
            </div>
          ))}

          {streamedTexts.map((text, index) => (
            <Markdown
              key={`stream-${index}`}
              content={text}
              theme={markdownTheme}
              className="prose prose-sm max-w-none text-sm"
            />
          ))}
        </div>

        {pendingInterrupt && threadId ? (
          <PendingInterruptPanel
            interrupt={pendingInterrupt}
            disabled={isStreaming}
            onSubmit={(resume) =>
              void chat.submitInterrupt({
                threadId,
                agentSlug: agentSlug ?? '',
                resume,
                interruptedRunId: pendingInterrupt.interruptedRunId,
              })
            }
            onCancel={() =>
              void chat.submitInterrupt({
                threadId,
                agentSlug: agentSlug ?? '',
                resume: 'reject',
                interruptedRunId: pendingInterrupt.interruptedRunId,
              })
            }
          />
        ) : null}

        {threadId ? (
          <QueueBar
            view={queueView}
            requests={queuedRequests}
            rowContext={queueRowContext}
            waitingForUserAction={isThreadWaitingForUserAction(runtime)}
            continuing={runtime?.continueQueueInFlight ?? false}
            disabled={!agentSlug}
            onSteer={(requestId) =>
              runQueueAction(
                chat.steer({ threadId, agentSlug: agentSlug ?? '', requestId }),
              )
            }
            onCancel={(requestId) =>
              runQueueAction(
                chat.cancelQueued({
                  threadId,
                  agentSlug: agentSlug ?? '',
                  requestId,
                }),
              )
            }
            onContinue={() =>
              runQueueAction(chat.continueQueue(threadId, agentSlug ?? ''))
            }
          />
        ) : null}

        <form className="flex items-center gap-2" onSubmit={onSubmit}>
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={agentSlug ? '输入消息' : '正在获取默认智能体…'}
            aria-label="消息输入"
          />
          <Button type="submit" disabled={!canSend}>
            发送
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!isStreaming}
            onClick={() => {
              if (threadId) void chat.cancelRun(threadId);
            }}
          >
            停止
          </Button>
        </form>
      </div>
    </ContentLayout>
  );
};
