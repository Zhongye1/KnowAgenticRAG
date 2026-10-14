/**
 * 对话页的提交编排。
 *
 * 普通发送与引导共用「必要时先建线程」这一条路径；附件确认也走它建线程但不发消息。
 * 发送失败按后端语义恢复：409 run_interrupted 把文本还给输入框，引导被拒绝时还原输入；
 * 建线程期间用户切走时放弃这次发送，不让迟到的创建落到当前线程上。
 */
import * as React from 'react';

import {
  AUTO_PROJECT_ID,
  isRunInterruptedConflict,
  resolveProjectId,
  SEND_COOLDOWN_MS,
  type ChatRuntime,
  type SendQueuePolicy,
  type ThreadAttachment,
  type ToolApprovalMode,
  type UploadedImage,
} from '@/features/chat';

type CreatedThread = Awaited<ReturnType<ChatRuntime['createThread']>>;

export type ChatSubmissionOptions = {
  /** 当前线程；没有线程时提交会先建线程。 */
  threadId?: string;
  /** 页面的挂载与线程上下文：建线程是异步的，期间用户可能切走或离开页面。 */
  contextRef: React.RefObject<{ mounted: boolean; threadId?: string }>;
  agentSlug?: string;
  /** 发送准入需要正文或图片其一；引导只要正文。 */
  input: string;
  currentInput: () => string;
  updateInput: (value: string) => void;
  image: UploadedImage | null;
  clearImage: () => void;
  pendingImageUploads: number;
  isStreaming: boolean;
  canSteerNow: boolean;
  chat: Pick<ChatRuntime, 'createThread' | 'sendMessage' | 'refreshQueue'>;
  /** 用户显式选过的审批模式；没有显式选择时不下发，交给后端解析。 */
  requestedToolApprovalMode: ToolApprovalMode | null;
  /** 项目选择只服务新会话；建出线程就重置回「不使用项目」。 */
  selectedProjectId: string;
  setSelectedProjectId: (projectId: string) => void;
  upsertThread: (thread: CreatedThread) => void;
  promoteModelDraft: (threadId: string) => void;
  navigateToThread: (threadId: string) => void;
  /** 没有显式选择也没有会话绑定时不下发模型。 */
  currentModelSpec: string;
  setThreadModelSpec: (threadId: string, modelSpec: string) => void;
  pendingAttachmentIds: string[];
  refetchAttachments: () => void;
  /** 首条消息触发标题生成；引导不算首条。 */
  hasMessages: boolean;
  maybeGenerateThreadTitle: (threadId: string, query: string) => void;
  confirmUpload: (threadId: string) => Promise<ThreadAttachment[]>;
  cacheThreadAttachments: (
    threadId: string,
    attachments: ThreadAttachment[],
  ) => void;
  notify: (notice: {
    type: 'error' | 'info' | 'success';
    title: string;
    message: string;
  }) => void;
};

export const useChatSubmission = (options: ChatSubmissionOptions) => {
  const [creatingThread, setCreatingThread] = React.useState(false);
  const [sendCooldownActive, setSendCooldownActive] = React.useState(false);
  const sendCooldownTimerRef = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (sendCooldownTimerRef.current !== null) {
        window.clearTimeout(sendCooldownTimerRef.current);
      }
    },
    [],
  );

  const canSend =
    (Boolean(options.input.trim()) || Boolean(options.image)) &&
    Boolean(options.agentSlug) &&
    !options.isStreaming &&
    options.pendingImageUploads === 0 &&
    !creatingThread &&
    !sendCooldownActive;

  const startSendCooldown = React.useCallback(() => {
    setSendCooldownActive(true);
    if (sendCooldownTimerRef.current !== null) {
      window.clearTimeout(sendCooldownTimerRef.current);
    }
    sendCooldownTimerRef.current = window.setTimeout(() => {
      setSendCooldownActive(false);
      sendCooldownTimerRef.current = null;
    }, SEND_COOLDOWN_MS);
  }, []);

  /**
   * 需要线程时的统一建线程动作；发送与附件确认共用。
   *
   * 返回 null 表示建线程期间用户已切走：放弃这次动作，但不清输入与图片（失败路径原样保留）。
   */
  const ensureThread = async (title?: string): Promise<string | null> => {
    if (options.threadId) return options.threadId;
    if (!options.agentSlug) throw new Error('正在获取默认智能体，请稍后再试');
    if (creatingThread) throw new Error('正在创建对话，请稍后再试');

    const routeThreadIdAtStart = options.threadId;
    setCreatingThread(true);
    try {
      const created = await options.chat.createThread(
        options.agentSlug,
        title,
        options.requestedToolApprovalMode,
        resolveProjectId(options.selectedProjectId),
      );
      // 项目只对这一次新会话有效；会话建出来就重置，后面的提前 return 也拦不住它
      options.setSelectedProjectId(AUTO_PROJECT_ID);
      const context = options.contextRef.current;
      if (!context.mounted || context.threadId !== routeThreadIdAtStart) {
        return null;
      }
      options.upsertThread(created);
      options.promoteModelDraft(created.id);
      options.navigateToThread(created.id);
      return created.id;
    } finally {
      setCreatingThread(false);
    }
  };

  const submitMessage = (queuePolicy: SendQueuePolicy = 'enqueue') => {
    const isSteer = queuePolicy === 'steer';
    if (isSteer ? !options.canSteerNow : !canSend) return;
    if (!options.agentSlug) return;
    const query = options.input.trim();
    if (!query && !isSteer && !options.image) return;

    // 受理即冷却：失败路径不回滚，冷却只挡连续触发
    startSendCooldown();
    // 引导只带文字：暂存的图片留在槽里
    const imageContent = isSteer ? null : (options.image?.imageContent ?? null);
    const routeThreadIdAtSubmit = options.threadId;

    void (async () => {
      try {
        const activeThreadId = await ensureThread(
          query.slice(0, 30) || undefined,
        );
        if (!activeThreadId) return;
        const context = options.contextRef.current;
        if (!context.mounted || context.threadId !== routeThreadIdAtSubmit) {
          // 用户已经离开或切走，这次发送的目标线程不再是当前上下文
          return;
        }

        // 建线程成功后才清输入：建线程失败时输入与草稿都原样保留，可以直接重发
        options.updateInput('');
        if (!isSteer) options.clearImage();
        // 下发的同时记进本地会话 metadata：后端会在创建 run 时绑定它，本地对象先跟上，
        // 否则用户随后清空选择会回退到一个还没刷新的旧值
        if (options.currentModelSpec) {
          options.setThreadModelSpec(activeThreadId, options.currentModelSpec);
        }

        await options.chat.sendMessage({
          threadId: activeThreadId,
          agentSlug: options.agentSlug!,
          query,
          imageContent,
          toolApprovalMode: options.requestedToolApprovalMode,
          queuePolicy,
          modelSpec: options.currentModelSpec || null,
          attachmentFileIds: options.pendingAttachmentIds,
          // 附件是单次使用的：请求受理后要刷新列表，否则下一次发送会重发已用掉的 id
          onAccepted: options.refetchAttachments,
        });

        if (!options.hasMessages && !isSteer) {
          options.maybeGenerateThreadTitle(activeThreadId, query);
        }
        await options.chat.refreshQueue(activeThreadId, options.agentSlug!);
      } catch (error) {
        const context = options.contextRef.current;
        const stillOnThread =
          context.mounted && context.threadId === routeThreadIdAtSubmit;

        // 409 run_interrupted：线程里有一条被打断的 run 正在等审批。
        // 把这次的文本还给输入框（审批提交后用户可以直接重发），已有内容时拼在后面
        if (isRunInterruptedConflict(error) && stillOnThread) {
          const draft = options.currentInput().trim();
          options.updateInput([query, draft].filter(Boolean).join('\n'));
          options.notify({
            type: 'info',
            title: '对话',
            message: '当前对话有一条被打断的任务在等待审批，已为你恢复输入。',
          });
          return;
        }

        // 引导被拒绝时把输入还原：只在仍停在同一线程、且输入框还空着时还原
        if (isSteer && stillOnThread && !options.currentInput().trim()) {
          options.updateInput(query);
        }
        options.notify({
          type: 'error',
          title: '对话',
          message: error instanceof Error ? error.message : '发送消息失败。',
        });
      }
    })();
  };

  const confirmAttachments = async () => {
    const threadId = await ensureThread();
    if (!threadId) throw new Error('新对话上下文已变化，请重新添加附件');

    const added = await options.confirmUpload(threadId);
    // 新会话的附件列表还没拉回来，先写进缓存，紧接着发的那条消息才不会漏掉它们
    options.cacheThreadAttachments(threadId, added);
    options.notify({
      type: 'success',
      title: '附件',
      message: added.length ? `已添加 ${added.length} 个附件` : '附件已添加',
    });
  };

  return { canSend, creatingThread, submitMessage, confirmAttachments };
};
