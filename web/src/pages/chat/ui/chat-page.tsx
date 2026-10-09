import * as React from 'react';
import { Bug } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import {
  agentRunApi,
  DRAFT_THREAD_ID,
  createThreadDraftSession,
  fetchAgentState,
  createThreadDraftStore,
  describeQueue,
  findClipboardImage,
  ImageAttachmentPreview,
  isThreadWaitingForUserAction,
  isToolApprovalMode,
  MessageList,
  MessageDebugPanel,
  mergeMessageDebugMessages,
  type DebugMessage,
  normalizeUploadedImage,
  PendingInterruptPanel,
  QueueBar,
  readTokenUsage,
  readToolApprovalModePreference,
  resolveToolApprovalMode,
  TokenUsageCard,
  ToolApprovalModeSelector,
  useChatRuntime,
  useStreamingMessages,
  useThreadList,
  useThreadRuntime,
  validateImageFile,
  writeToolApprovalModePreference,
} from '@/features/chat';
import type { ToolApprovalMode, UploadedImage } from '@/features/chat';
import { useIsSuperuser } from '@/entities/session';
import { paths } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { ContentLayout } from '@/shared/ui/content-layout';
import { Input } from '@/shared/ui/input';
import { useNotifications } from '@/shared/ui/notifications';
import { Spinner } from '@/shared/ui/spinner';

/**
 * 对话页。
 *
 * 覆盖最小闭环：进入线程加载权威历史、发送消息、流式渲染回复、中止运行、
 * 排队请求的插队/取消与队列继续、按线程保存未发送的输入、随消息发送一张图片。
 * 地址里没有线程时，第一次发送会先建线程再跳转（与上游一致），因此 `/agent`
 * 也能直接开始对话。
 *
 * 子代理线程视图与工具调用渲染随 S2 的后续步骤补齐。
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
  // 草稿会话持有「当前输入属于哪条线程」，因此只创建一次，不能随渲染重建
  const [draft] = React.useState(() => {
    const store = createThreadDraftStore();
    return { store, session: createThreadDraftSession(store, routeThreadId) };
  });
  const [input, setInputState] = React.useState(() =>
    draft.store.read(routeThreadId || DRAFT_THREAD_ID),
  );
  // 输入框的权威值：切线程的 effect 要读「此刻」的输入。不能把 `input` 放进
  // effect 依赖（每敲一个字都会重跑切线程），也不能用 setState 的 updater 读当前值
  // （StrictMode 会双调用 updater，第一次已把 draftKey 换成新线程，第二次就把旧线程
  // 的文本写进新线程的草稿键），所以由 ref 同步持有。
  const inputRef = React.useRef(input);
  /** 输入变化统一走这里：先同步 ref 与草稿，再更新 state。 */
  const updateInput = React.useCallback(
    (value: string) => {
      inputRef.current = value;
      draft.session.saveInput(value);
      setInputState(value);
    },
    [draft],
  );
  // 待发送的单张图片：上游同一位置也是单槽，选新图直接覆盖
  const [image, setImage] = React.useState<UploadedImage | null>(null);
  // 在途上传数：不止一张图时，先回来的那张不能提前放开发送按钮
  const [pendingUploads, setPendingUploads] = React.useState(0);
  // 上传世代号：切线程或又选了一张图都会作废更早的响应，
  // 否则迟到的响应会把上一张图写回已经换掉的输入框
  const uploadGenerationRef = React.useRef(0);
  const imageFileInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    // 切线程（含从 /agent 进入新线程）时先把当前文本写回旧线程，再取新线程的草稿；
    // 待发送的图片不跟线程走：留在输入框里会发给另一条线程
    const next = draft.session.switchThread(routeThreadId, inputRef.current);
    inputRef.current = next;
    setInputState(next);
    uploadGenerationRef.current += 1;
    setImage(null);
  }, [draft, routeThreadId]);
  // 智能体由会话列表 store 统一解析：侧边栏与对话页必须指向同一个
  const agentSlug = useThreadList((state) => state.agentSlug) ?? undefined;
  const ensureAgentSlug = useThreadList((state) => state.ensureAgentSlug);
  const upsertThread = useThreadList((state) => state.upsert);
  const notifications = useNotifications();
  const runtime = useThreadRuntime(threadId);
  const streamingMessages = useStreamingMessages(threadId);
  // 消息时序调试：入口只给超管（后端接口自身也要求超管），面板只看当前线程的消息
  const isSuperuser = useIsSuperuser();
  const [debugOpen, setDebugOpen] = React.useState(false);

  // 审批模式按上游的三级回退解析：有线程看线程 metadata，无线程看本地偏好与智能体默认值
  const agentToolApprovalMode = useThreadList(
    (state) => state.agentToolApprovalMode,
  );
  const setThreadToolApprovalMode = useThreadList(
    (state) => state.setToolApprovalMode,
  );
  const storedThreadToolApprovalMode = useThreadList(
    (state) =>
      state.threads.find((item) => item.id === routeThreadId)?.metadata
        ?.tool_approval_mode,
  );
  // metadata 是后端可写的自由字段，取值要校验后才当成模式用
  const threadToolApprovalMode = isToolApprovalMode(
    storedThreadToolApprovalMode,
  )
    ? storedThreadToolApprovalMode
    : null;
  const [savedToolApprovalMode, setSavedToolApprovalMode] =
    React.useState<ToolApprovalMode | null>(() =>
      readToolApprovalModePreference(),
    );
  /**
   * 真正下发给后端的只有「用户显式选过」的值。
   *
   * 后端解析这次 run 的模式是 `请求值 ?? 智能体配置 ?? 默认值`，从不读线程 metadata，
   * 因此把界面的回退值一起发出去会静默覆盖智能体配置（普通用户在界面上看不到那一级）。
   */
  const requestedToolApprovalMode =
    threadToolApprovalMode ?? savedToolApprovalMode;
  /**
   * 选择器上显示的模式。`hasThread` 只在「线程自己带了合法模式」时为真：显示与下发必须同源，
   * 否则会出现界面写着「请求审批」、实际按本地偏好完全信任执行的相反结果。
   */
  const toolApprovalMode = resolveToolApprovalMode({
    hasThread: Boolean(threadId) && threadToolApprovalMode !== null,
    threadMode: threadToolApprovalMode,
    agentMode: agentToolApprovalMode,
    savedMode: savedToolApprovalMode,
  });

  /**
   * 选择审批模式：新建对话只记本地偏好（建线程时随 metadata 落到线程上），
   * 已有线程先持久化再记偏好——保存失败时不能让偏好改变之后所有新线程。
   */
  const onChangeToolApprovalMode = (mode: ToolApprovalMode) => {
    if (!threadId) {
      setSavedToolApprovalMode(mode);
      writeToolApprovalModePreference(mode);
      return;
    }
    void setThreadToolApprovalMode(threadId, mode).then((ok) => {
      if (!ok) {
        notifyError('审批模式保存失败');
        return;
      }
      setSavedToolApprovalMode(mode);
      writeToolApprovalModePreference(mode);
    });
  };

  const notifyError = React.useCallback(
    (message: string) => {
      notifications.addNotification({ type: 'error', title: '对话', message });
    },
    [notifications],
  );

  /** 上传一张图片到图片槽；校验与文案都在 `image-upload` 里，这里只管状态。 */
  const uploadImageFile = React.useCallback(
    (file: File) => {
      const invalid = validateImageFile(file);
      if (invalid) {
        notifyError(invalid);
        return;
      }
      const generation = (uploadGenerationRef.current += 1);
      setPendingUploads((count) => count + 1);
      agentRunApi
        .uploadImage(file)
        .then((response) => {
          // 这次上传已经被切线程或更新的选择作废：不能再写回图片槽
          if (uploadGenerationRef.current !== generation) return;
          setImage(normalizeUploadedImage(response, file.name));
        })
        .catch((error: unknown) => {
          if (uploadGenerationRef.current !== generation) return;
          notifyError(
            error instanceof Error ? error.message : '图片上传失败，请重试。',
          );
        })
        .finally(() => {
          setPendingUploads((count) => Math.max(0, count - 1));
        });
    },
    [notifyError],
  );

  const markThreadViewed = useThreadList((state) => state.markViewed);
  const chat = useChatRuntime({
    currentAgentId: () => agentSlug,
    fetchAgentState: (_agentId, stateThreadId) => {
      void fetchAgentState(stateThreadId);
    },
    // run 收尾或中断时后端会把该线程标成 ready。只有用户正看着的线程才算已读：
    // 后台线程跑完要保留未读点，否则侧边栏永远不会提示有新回复。
    onRunSettled: (settledThreadId) => {
      if (settledThreadId !== contextRef.current.threadId) return;
      void markThreadViewed(settledThreadId);
    },
    onNotice: (notice) =>
      notifications.addNotification({
        type: notice.level === 'error' ? 'error' : 'info',
        title: '对话',
        message: notice.message,
      }),
  });

  React.useEffect(() => {
    void ensureAgentSlug();
  }, [ensureAgentSlug]);

  React.useEffect(() => {
    if (!threadId) return;
    // 打开线程即已读：与上游一致，失败只记录，不影响阅读
    void markThreadViewed(threadId);
    void chat.loadHistory(threadId).catch(() => {
      notifications.addNotification({
        type: 'error',
        title: '对话',
        message: '加载对话历史失败。',
      });
    });
  }, [chat, markThreadViewed, threadId]);

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
    import('@/features/chat').PendingInterrupt | null;
  const isStreaming = runtime?.isStreaming ?? false;
  const queueView = describeQueue(
    runtime?.queueSnapshot,
    runtime?.queuedRequests,
  );
  const queuedRequests = runtime?.queuedRequests ?? [];
  const queueRowContext = {
    isStreaming,
    activeRunSteerable: runtime?.activeRunSteerable ?? false,
    hasPendingSteer: queuedRequests.some(
      (request) => request.queue_policy === 'steer',
    ),
    queueStatus: runtime?.queueSnapshot?.status ?? 'idle',
  };
  // 只要正文或图片有一项就能发；上传中与流式中都不允许再发
  const canSend =
    (Boolean(input.trim()) || Boolean(image)) &&
    Boolean(agentSlug) &&
    !isStreaming &&
    pendingUploads === 0;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend || !agentSlug) return;
    const query = input.trim();
    const imageContent = image?.imageContent ?? null;
    const routeThreadIdAtSubmit = threadId;
    void (async () => {
      try {
        const isNewThread = !threadId;
        const created = isNewThread
          ? await chat.createThread(
              agentSlug,
              query.slice(0, 30) || undefined,
              requestedToolApprovalMode,
            )
          : null;
        const activeThreadId = threadId ?? created?.id ?? '';
        const context = contextRef.current;
        if (!context.mounted || context.threadId !== routeThreadIdAtSubmit) {
          // 用户已经离开或切走，这次发送的目标线程不再是当前上下文
          return;
        }
        // 先把地址写到新线程：`sendMessage` 要等整段流结束才返回，
        // 期间页面只有拿到真实 threadId 才能渲染流式回复
        if (created) {
          // 用后端落库的线程，标题与刷新后的列表一致
          upsertThread(created);
          navigate(paths.app.chat.getHref(created.id), { replace: true });
        }
        // 建线程成功后才清输入：建线程失败时输入与草稿都原样保留，可以直接重发
        updateInput('');
        setImage(null);
        await chat.sendMessage({
          threadId: activeThreadId,
          agentSlug,
          query,
          imageContent,
          toolApprovalMode: requestedToolApprovalMode,
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

  /** 粘贴图片即上传；文本粘贴不拦截，交给输入框的默认行为。 */
  const onPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const file = findClipboardImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    uploadImageFile(file);
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

  return (
    <ContentLayout title="智能体对话">
      <div className="flex flex-col gap-4 py-4">
        <div className="flex min-h-40 flex-col gap-4 rounded-large border border-color-border-1 bg-color-bg-1 p-4">
          {isSuperuser ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={debugOpen}
                onClick={() => setDebugOpen((current) => !current)}
              >
                <Bug className="size-3.5" />
                {debugOpen ? '关闭调试' : '消息调试'}
              </Button>
            </div>
          ) : null}
          <MessageList
            messages={messages}
            streamingMessages={streamingMessages}
            isProcessing={isStreaming}
          />
        </div>

        {debugOpen ? (
          <MessageDebugPanel
            messages={mergeMessageDebugMessages(
              messages as unknown as DebugMessage[],
              streamingMessages as unknown as DebugMessage[],
              runtime?.activeRunId ?? null,
            )}
            fetchLangfuseUrl={(runId) => agentRunApi.getRunLangfuseLink(runId)}
          />
        ) : null}

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

        <TokenUsageCard usage={readTokenUsage(runtime?.agentState)} />

        {image ? (
          <ImageAttachmentPreview
            image={image}
            onRemove={() => setImage(null)}
          />
        ) : null}

        <form className="flex items-center gap-2" onSubmit={onSubmit}>
          <ToolApprovalModeSelector
            value={toolApprovalMode}
            onChange={onChangeToolApprovalMode}
          />
          <Input
            value={input}
            onChange={(event) => updateInput(event.target.value)}
            onPaste={onPaste}
            placeholder={agentSlug ? '输入消息' : '正在获取默认智能体…'}
            aria-label="消息输入"
          />
          {/* 上游此处是图标按钮；这里用同义的文字按钮，交互（选图 / 粘贴）完全一致 */}
          <Button
            type="button"
            variant="outline"
            disabled={isStreaming}
            onClick={() => imageFileInputRef.current?.click()}
          >
            {pendingUploads > 0 ? (
              <Spinner aria-hidden className="size-4" />
            ) : null}
            图片
          </Button>
          <input
            ref={imageFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="选择图片"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // 先清 value 再上传：连续选同一张图也要触发 change
              event.target.value = '';
              if (file) uploadImageFile(file);
            }}
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
