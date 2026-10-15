/**
 * 对话页容器。
 *
 * 只做组合与接线：路由身份（`/agent` 与 `/agent/:threadId` 复用同一实例，线程只以
 * 地址为准）、运行时装配、面板/附件/项目/模型/审批状态，以及把结果交给视图。
 * 提交编排（发送/引导/建线程/附件确认）在 `model/use-chat-submission`，
 * 线程生命周期副作用在 `model/use-chat-thread-lifecycle`，页面结构在 `ui/chat-page-view`。
 */
import * as React from 'react';

import {
  agentRunApi,
  ArtifactsCard,
  buildReplyLoadingStatus,
  buildMentionConfig,
  buildMentionDisplayLabels,
  buildMentionFileItems,
  buildMentionResourceItems,
  canSubmitDirectSteer,
  describeQueue,
  extractArtifactsFromConversation,
  fallbackTitleFromQuery,
  fetchAgentState,
  generateConversationTitle,
  hasPendingDirectSteer,
  isThreadWaitingForUserAction,
  isToolApprovalMode,
  mergeMessageDebugMessages,
  normalizeArtifactItems,
  ProjectSelector,
  readTokenUsage,
  readToolApprovalModePreference,
  resolveModelSpec,
  resolveToolApprovalMode,
  ScrollController,
  searchMentionFiles,
  useAgentConfig,
  useAgentOptions,
  useAgentPanelSections,
  useArtifactActions,
  useAttachmentUpload,
  useCacheThreadAttachments,
  useChatModels,
  useChatRuntime,
  useCreateLinkedProject,
  useDefaultOcrEngine,
  useDebouncedValue,
  useFastModel,
  useHistoryCandidates,
  useImageUploadSlot,
  useModelOverride,
  useModelSelection,
  usePanelFileSearch,
  usePanelFilesystem,
  usePanelPreview,
  useProjects,
  useStreamingMessages,
  useSystemDefaultModel,
  useThreadAttachments,
  useThreadDraftInput,
  useThreadList,
  useThreadRuntime,
  writeToolApprovalModePreference,
  HISTORY_SEARCH_DEBOUNCE_MS,
  AUTO_PROJECT_ID,
  shouldPollPanelFilesystem,
  pendingAttachmentFileIds,
  pendingThreadAttachments,
  type Conversation,
  type DebugMessage,
  type MentionResourceItem,
  type ToolApprovalMode,
} from '@/features/chat';
import { useIsSuperuser } from '@/entities/session';
import { useNotifications } from '@/shared/ui/notifications';
import { useKnowledgeBases } from '@/features/knowledge-base';
import { paths } from '@/shared/config';
import { ContentLayout } from '@/shared/ui/content-layout';
import { pathBreadcrumbs } from '@/shared/lib/files';
import { useNavigate, useParams } from 'react-router';

import { useChatSubmission } from '../model/use-chat-submission';
import { useChatThreadLifecycle } from '../model/use-chat-thread-lifecycle';
import { ChatPageView } from './chat-page-view';

const GREETINGS = ['与知识对话，与答案相遇', '你负责提问，我负责寻找'];

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

  const { addNotification } = useNotifications();
  const notify = React.useCallback(
    (notice: {
      type: 'error' | 'info' | 'success';
      title: string;
      message: string;
    }) => {
      addNotification(notice);
    },
    [addNotification],
  );

  // 草稿输入与单槽图片上传：状态层在 features/chat/model，页面只消费
  const {
    input,
    currentInput,
    updateInput,
    switchThread: switchDraftThread,
  } = useThreadDraftInput(routeThreadId);
  const imageSlot = useImageUploadSlot({
    notifyError: (message) => notify({ type: 'error', title: '对话', message }),
  });
  // 空态标语挂在挂载期选一次；写在渲染体内会随每次重渲换文案
  const [greeting] = React.useState(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
  );
  React.useEffect(() => {
    // 切线程（含从 /agent 进入新线程）时回写草稿；待发送的图片不跟线程走，
    // 同时作废在途上传的回填，迟到的响应不能把上一条线程的图写进这一条
    switchDraftThread(routeThreadId);
    imageSlot.clear();
    imageSlot.invalidate();
    // imageSlot 的动作是稳定回调，不在依赖里展开
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeThreadId, switchDraftThread]);

  // 智能体由会话列表 store 统一解析：侧边栏与对话页必须指向同一个
  const agentSlug = useThreadList((state) => state.agentSlug) ?? undefined;
  const selectAgent = useThreadList((state) => state.selectAgent);
  const ensureAgentSlug = useThreadList((state) => state.ensureAgentSlug);
  const upsertThread = useThreadList((state) => state.upsert);
  const renameThread = useThreadList((state) => state.rename);
  const markThreadViewed = useThreadList((state) => state.markViewed);
  const { options: agentOptions, isLoading: agentsLoading } = useAgentOptions();
  // 底部提示：展示当前智能体名
  const currentAgentName = agentOptions.find(
    (option) => option.value === agentSlug,
  )?.label;

  const runtime = useThreadRuntime(threadId);
  const isStreaming = runtime?.isStreaming ?? false;
  const streamingMessages = useStreamingMessages(threadId);
  const isSuperuser = useIsSuperuser();

  // 右侧面板：分区列表、开关、最大化与拖宽都在 model 层的 hook 里
  const panel = useAgentPanelSections();
  // 轮询的前提之一：后台标签页不轮询
  const [pageVisible, setPageVisible] = React.useState(
    () => document.visibilityState === 'visible',
  );
  React.useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // 产物动作：下载与保存到个人空间，在途集合也在 hook 里
  const artifactActions = useArtifactActions({
    notifyError: (message) => notify({ type: 'error', title: '对话', message }),
    notifySuccess: (message) =>
      notify({ type: 'success', title: '对话', message }),
  });

  // 面板文件系统：两套树的状态与轮询都在这里
  const [treeScope, setTreeScope] = React.useState<'thread' | 'workspace'>(
    'thread',
  );
  const activePanelSection = panel.sections.find(
    (section) => section.key === panel.activeSectionKey,
  );
  const panelFilesystem = usePanelFilesystem({
    threadId,
    pollingEnabled: shouldPollPanelFilesystem({
      panelOpen: panel.open,
      pageVisible,
      streaming: isStreaming,
      activeSection: activePanelSection,
      // 预览由树点开：身份跟随当前树的作用域（个人空间的文件不随生成变化）
      activePreview:
        activePanelSection?.type === 'file'
          ? { workdir: treeScope === 'thread' }
          : null,
    }),
  });
  const panelPreview = usePanelPreview({ threadId });
  // 树的文件搜索：防抖 250ms
  const [fileSearchOpen, setFileSearchOpen] = React.useState(false);
  const [fileSearchQuery, setFileSearchQuery] = React.useState('');
  const debouncedFileSearchQuery = useDebouncedValue(fileSearchQuery, 250);
  const fileSearch = usePanelFileSearch({
    scope: treeScope,
    threadId,
    query: debouncedFileSearchQuery,
    enabled: fileSearchOpen,
  });
  // 面板一打开就把当前作用域的树备好
  React.useEffect(() => {
    if (!panel.open) return;

    void panelFilesystem.refreshThreadTree();
    void panelFilesystem.refreshWorkspaceTree();
    // 只在打开那一刻拉一次；之后的更新来自懒加载与轮询
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.open, threadId]);

  // 审批模式按三级回退解析：有线程看线程 metadata，无线程看本地偏好与智能体默认值
  const agentToolApprovalMode = useThreadList(
    (state) => state.agentToolApprovalMode,
  );
  const setThreadToolApprovalMode = useThreadList(
    (state) => state.setToolApprovalMode,
  );
  // 模型按四级回退：按会话的覆盖 → 会话 metadata 的绑定 → 智能体配置 → 系统默认
  const threadMetadata = useThreadList(
    (state) =>
      state.threads.find((item) => item.id === routeThreadId)?.metadata,
  );
  const modelOverride = useModelOverride(routeThreadId);
  const setModelOverride = useModelSelection((state) => state.setOverride);
  const setThreadModelSpec = useThreadList((state) => state.setModelSpec);
  const promoteModelDraft = useModelSelection((state) => state.promoteDraft);
  const chatModels = useChatModels();
  const systemDefaultModel = useSystemDefaultModel();

  // 状态面板的手动刷新在途标记；刷新按钮据此禁用并转圈
  const [stateRefreshing, setStateRefreshing] = React.useState(false);
  // 附件上传：条目只在弹窗打开期间存在，关闭即清空
  const [attachmentOpen, setAttachmentOpen] = React.useState(false);
  const attachmentUpload = useAttachmentUpload({
    configuredEngine: useDefaultOcrEngine(),
  });
  // 会话里已确认的附件：还没被请求用掉的那些要随下一次发送下发，同时也是输入区的预览
  const threadAttachments = useThreadAttachments(threadId);
  const cacheThreadAttachments = useCacheThreadAttachments();
  const pendingAttachments = pendingThreadAttachments(
    threadAttachments.data ?? [],
  );
  const pendingAttachmentIds = pendingAttachmentFileIds(pendingAttachments);

  // 项目只在还没有会话时可选：它决定这条会话的工作目录，建出来就改不了
  const [selectedProjectId, setSelectedProjectId] =
    React.useState(AUTO_PROJECT_ID);
  const [historyQuery, setHistoryQuery] = React.useState('');
  const projects = useProjects();
  const createProject = useCreateLinkedProject();
  const historyCandidates = useHistoryCandidates(
    useDebouncedValue(historyQuery, HISTORY_SEARCH_DEBOUNCE_MS),
  );

  // metadata 是后端可写的自由字段，取值要校验后才当成模式用
  const storedThreadToolApprovalMode = useThreadList(
    (state) =>
      state.threads.find((item) => item.id === routeThreadId)?.metadata
        ?.tool_approval_mode,
  );
  const threadToolApprovalMode = isToolApprovalMode(
    storedThreadToolApprovalMode,
  )
    ? storedThreadToolApprovalMode
    : null;
  const [savedToolApprovalMode, setSavedToolApprovalMode] =
    React.useState<ToolApprovalMode | null>(() =>
      readToolApprovalModePreference(),
    );
  // 真正下发给后端的只有「用户显式选过」的值：把界面的回退值一起发出去会
  // 静默覆盖智能体配置（普通用户在界面上看不到那一级）
  const requestedToolApprovalMode =
    threadToolApprovalMode ?? savedToolApprovalMode;
  // 选择器上显示的模式：显示与下发必须同源，否则界面与实际生效模式会相反
  const toolApprovalMode = resolveToolApprovalMode({
    hasThread: Boolean(threadId) && threadToolApprovalMode !== null,
    threadMode: threadToolApprovalMode,
    agentMode: agentToolApprovalMode,
    savedMode: savedToolApprovalMode,
  });

  // 选择审批模式：新建对话只记本地偏好；已有线程先持久化再记偏好，
  // 保存失败时不能让偏好改变之后所有新线程
  const onChangeToolApprovalMode = (mode: ToolApprovalMode) => {
    if (!threadId) {
      setSavedToolApprovalMode(mode);
      writeToolApprovalModePreference(mode);
      return;
    }
    void setThreadToolApprovalMode(threadId, mode).then((ok) => {
      if (!ok) {
        notify({ type: 'error', title: '对话', message: '审批模式保存失败' });
        return;
      }
      setSavedToolApprovalMode(mode);
      writeToolApprovalModePreference(mode);
    });
  };

  // 标题生成走快速模型；管理面读不到时是 undefined，生成调用会失败并回退截断
  const fastModel = useFastModel();
  // 会话标题自动生成：只有当前线程仍是发送目标线程时才写回，防止切线程后旧标题串台
  const maybeGenerateThreadTitle = React.useCallback(
    async (targetThreadId: string, query: string) => {
      const fallback = fallbackTitleFromQuery(query);
      if (!fallback) return;
      let title = fallback;
      try {
        const generated = await generateConversationTitle({
          query,
          modelSpec: fastModel,
        });
        if (generated) title = generated;
      } catch {
        // 生成失败不是用户的错误：静默回退到截断文案
      }
      if (contextRef.current.threadId !== targetThreadId) return;
      void renameThread(targetThreadId, title);
    },
    [fastModel, renameThread],
  );

  // 滚动控制：流式输出与切线程后的跟滚都在这里
  const chatMainRef = React.useRef<HTMLDivElement>(null);
  const scrollControllerRef = React.useRef<ScrollController | null>(null);
  if (!scrollControllerRef.current) {
    scrollControllerRef.current = new ScrollController(
      () => chatMainRef.current,
    );
  }
  const scrollController = scrollControllerRef.current;
  React.useEffect(() => {
    const chatMain = chatMainRef.current;
    if (!chatMain) return;
    chatMain.addEventListener('scroll', scrollController.handleScroll, {
      passive: true,
    });
    return () => {
      chatMain.removeEventListener('scroll', scrollController.handleScroll);
      scrollController.cleanup();
    };
  }, [scrollController]);

  const chat = useChatRuntime({
    currentAgentId: () => agentSlug,
    // 流式输出与收尾时自动跟滚；用户上滚后由 controller 停用
    onScrollToBottom: () => void scrollController.scrollToBottom(),
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
      notify({
        type: notice.level === 'error' ? 'error' : 'info',
        title: '对话',
        message: notice.message,
      }),
  });

  useChatThreadLifecycle({
    threadId,
    agentSlug,
    chat,
    ensureAgentSlug,
    markThreadViewed,
    scrollToBottomStaticForce: () =>
      void scrollController.scrollToBottomStaticForce(),
    notify: (notice) => notify(notice),
  });

  // 工具行要显示「知识库: X」，但 `kb_id` 只有名称列表才能翻译；列表按 id 建一次索引
  const knowledgeBases = useKnowledgeBases();
  const resolveKbName = React.useMemo(() => {
    const nameById = new Map(
      (knowledgeBases.data ?? []).map((item) => [item.kb_id, item.name]),
    );
    return (kbId: string) => nameById.get(kbId) ?? '';
  }, [knowledgeBases.data]);

  // 提及候选按当前智能体的配置过滤：列出这个智能体可用的知识库 / MCP / 技能 / 子智能体
  const agentConfig = useAgentConfig(agentSlug);
  const currentModelSpec = resolveModelSpec({
    override: modelOverride,
    threadMetadata,
    agentConfig: agentConfig.agentConfig,
    systemDefault: systemDefaultModel,
  });
  const mentionConfig = React.useMemo(
    () =>
      buildMentionConfig({
        configurableItems: agentConfig.configurableItems,
        agentConfig: agentConfig.agentConfig,
      }),
    [agentConfig.configurableItems, agentConfig.agentConfig],
  );
  const mentionResources = React.useMemo(
    () => buildMentionResourceItems(mentionConfig),
    [mentionConfig],
  );
  const mentionItems: MentionResourceItem[] = React.useMemo(
    () => [
      ...mentionResources.knowledgeBases,
      ...mentionResources.mcps,
      ...mentionResources.skills,
      ...mentionResources.subagents,
    ],
    [mentionResources],
  );
  const mentionLabels = React.useMemo(
    () => buildMentionDisplayLabels(mentionConfig),
    [mentionConfig],
  );
  const searchMentionFilesForThread = React.useCallback(
    async (query: string) =>
      buildMentionFileItems(
        await searchMentionFiles({
          ...(routeThreadId ? { threadId: routeThreadId } : {}),
          query,
        }),
      ),
    [routeThreadId],
  );

  const pendingInterrupt = runtime?.pendingInterrupt ?? null;
  const queueView = describeQueue(
    runtime?.queueSnapshot,
    runtime?.queuedRequests,
  );
  const queuedRequests = runtime?.queuedRequests ?? [];

  // 生成中状态条：`replyLoadingVisible` 起效即计时，消失即清零；只在有对话时展示
  const replyStatus = buildReplyLoadingStatus({
    replyLoadingVisible: runtime?.replyLoadingVisible ?? false,
    contextCompressing: runtime?.contextCompressing ?? false,
    queuePaused:
      (runtime?.queueSnapshot?.status ?? 'idle') === 'paused' ||
      Boolean(runtime?.queueSnapshot?.paused_reason),
    queuedCount: queuedRequests.length,
  });
  const [replyElapsedSeconds, setReplyElapsedSeconds] = React.useState(0);
  React.useEffect(() => {
    if (!replyStatus.visible) {
      setReplyElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setReplyElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [replyStatus.visible]);

  const queueRowContext = {
    isStreaming,
    activeRunSteerable: runtime?.activeRunSteerable ?? false,
    hasPendingSteer: hasPendingDirectSteer(queuedRequests),
    queueStatus: runtime?.queueSnapshot?.status ?? 'idle',
  };
  const isWaitingForUserAction = isThreadWaitingForUserAction(runtime);

  // 运行中把还没发出的输入作为引导插队
  const canSteerNow = canSubmitDirectSteer({
    isStreaming,
    activeRunSteerable: runtime?.activeRunSteerable ?? false,
    hasInput: Boolean(input.trim()),
    hasAgent: Boolean(agentSlug),
    hasPendingSteer: queueRowContext.hasPendingSteer,
    isWaitingForUserAction,
  });

  const { canSend, creatingThread, submitMessage, confirmAttachments } =
    useChatSubmission({
      threadId,
      contextRef,
      agentSlug,
      input,
      currentInput,
      updateInput,
      image: imageSlot.image,
      clearImage: imageSlot.clear,
      pendingImageUploads: imageSlot.pendingUploads,
      isStreaming,
      canSteerNow,
      chat,
      requestedToolApprovalMode,
      selectedProjectId,
      setSelectedProjectId,
      upsertThread,
      promoteModelDraft,
      navigateToThread: (id) =>
        navigate(paths.app.chat.getHref(id), { replace: true }),
      currentModelSpec,
      setThreadModelSpec,
      pendingAttachmentIds,
      refetchAttachments: () => void threadAttachments.refetch(),
      hasMessages: (runtime?.messages ?? []).length > 0,
      maybeGenerateThreadTitle,
      confirmUpload: attachmentUpload.confirm,
      cacheThreadAttachments,
      notify,
    });

  /** 一轮对话的产物卡片；提取与归一在 `lib/artifacts.ts`。 */
  const renderArtifacts = React.useCallback(
    (conversation: Conversation) => {
      const artifacts = normalizeArtifactItems(
        extractArtifactsFromConversation(conversation),
      );
      if (artifacts.length === 0) return null;
      return (
        <ArtifactsCard
          artifacts={artifacts}
          threadId={threadId}
          savingPaths={artifactActions.savingPaths}
          onOpenPreview={(artifact) => {
            panel.openSection({
              key: `file:thread:${artifact.path}`,
              type: 'file',
              title: artifact.name,
              path: artifact.path,
            });
            panel.setOpen(true);
            panelPreview.open({
              scope: 'thread',
              path: artifact.path,
              name: artifact.name,
            });
          }}
          onDownload={(artifact) =>
            artifactActions.download(threadId, artifact)
          }
          onSave={(artifact) => artifactActions.save(threadId, artifact)}
        />
      );
    },
    [notify, panelPreview, artifactActions, threadId],
  );

  // 会话标题：「新的对话」不显示
  const currentThreadTitle = useThreadList(
    (state) => state.threads.find((item) => item.id === routeThreadId)?.title,
  );

  const messages = runtime?.messages ?? [];
  // 面板：分区子智能体随 agent_state 同步；增删规则在 hook 里
  React.useEffect(() => {
    panel.syncSubagentRuns(runtime?.agentState);
  }, [panel.syncSubagentRuns, runtime?.agentState]);

  /** 打开线程文件的预览分区；状态面板的产物/文件列表用它。 */
  const openThreadPreview = (path: string, name: string) => {
    panel.openSection({
      key: `file:thread:${path}`,
      type: 'file',
      title: name,
      path,
      scope: 'thread',
    });
    panelPreview.open({ scope: 'thread', path, name });
    panel.setOpen(true);
    panel.setStateOpen(false);
  };

  /** 打开子智能体线程分区；状态面板的子智能体列表用它（同样要把文件面板打开）。 */
  const openSubagentSection = ({
    runId,
    childThreadId,
    name,
    status,
  }: {
    runId: string | null;
    childThreadId: string;
    name: string;
    status: string | undefined;
  }) => {
    panel.openSection({
      key: `subagent:${runId ?? childThreadId}`,
      type: 'subagent',
      title: name,
      threadId: childThreadId,
      runId: runId ?? undefined,
      runStatus: status,
    });
    panel.setOpen(true);
    panel.setStateOpen(false);
  };

  /** 拉一次 agent_state；状态面板的刷新按钮与打开面板时的补拉都用它。 */
  const refreshState = async () => {
    if (!threadId) return;
    setStateRefreshing(true);
    try {
      await fetchAgentState(threadId);
    } finally {
      setStateRefreshing(false);
    }
  };

  /** 开关状态面板。 */
  const toggleStatePanel = () => {
    const next = !panel.stateOpen;
    panel.setStateOpen(next);
    if (next && threadId && !runtime?.agentState) void refreshState();
  };

  /** 当前激活的分区是文件预览时的那个分区；用于按 path 解析预览内容。 */
  const activeFileSection = panel.sections.find(
    (section) =>
      section.key === panel.activeSectionKey && section.type === 'file',
  );

  return (
    <ContentLayout title="智能体对话" fullHeight>
      <ChatPageView
        header={{
          title: currentThreadTitle ?? null,
          isSuperuser,
          onToggleDebug: panel.toggleWithDebugSection,
          onToggleFiles: () => {
            if (!panel.open) {
              panel.openSection({
                key: 'file-tree',
                type: 'file-tree',
                title: '文件',
              });
            }
            // 两块面板不同时占横向空间
            panel.setStateOpen(false);
            panel.setOpen((current) => !current);
          },
          onToggleState: toggleStatePanel,
        }}
        conversation={{
          messages,
          streamingMessages,
          isStreaming,
          replyStatus,
          replyElapsedSeconds,
          resolveKbName,
          renderArtifacts,
          chatMainRef,
        }}
        composer={{
          agentOptions,
          agentsLoading,
          hasActiveThread: Boolean(threadId),
          isCreatingThread: creatingThread,
          onSelectAgent: selectAgent,
          onAgentBlocked: (reason) =>
            notify({ type: 'info', title: '智能体', message: reason }),
          toolApprovalMode,
          onChangeToolApprovalMode,
          tokenUsage: readTokenUsage(runtime?.agentState),
          onContextRingClick: toggleStatePanel,
          modelSelected: currentModelSpec,
          modelGroups: chatModels.data ?? [],
          modelsLoading: chatModels.isPending,
          onSelectModel: (spec) => setModelOverride(routeThreadId, spec),
          canSteerNow,
          onSteer: () => submitMessage('steer'),
          onOpenAttachments: () => setAttachmentOpen(true),
          imagePending: imageSlot.pendingUploads > 0,
          imageFileInputRef: imageSlot.fileInputRef,
          onImageFileChange: imageSlot.onFileInputChange,
          image: imageSlot.image,
          onRemoveImage: imageSlot.clear,
          pendingAttachments,
          input,
          onInputPaste: imageSlot.onPaste,
          onInputChange: updateInput,
          onSubmit: () => submitMessage(),
          inputPlaceholder: agentSlug ? '输入消息' : '正在获取默认智能体…',
          mentionItems,
          mentionLabels,
          onSearchFiles: searchMentionFilesForThread,
          onDropFiles: imageSlot.onDropFiles,
          canSend,
          isStreaming,
          inert: Boolean(pendingInterrupt && threadId),
          onCancelRun: () => {
            if (threadId) void chat.cancelRun(threadId);
          },
          attachmentUpload,
          onConfirmAttachments: confirmAttachments,
          queueView,
          queuedRequests,
          queueRowContext,
          waitingForUserAction: isWaitingForUserAction,
          continuing: runtime?.continueQueueInFlight ?? false,
          runQueueAction: (action) => {
            // 队列动作的失败原因是后端语义（如「已派发不可取消」），必须如实转达
            void action.catch((error: unknown) => {
              notify({
                type: 'error',
                title: '队列',
                message:
                  error instanceof Error ? error.message : '队列操作失败。',
              });
            });
          },
          chat,
          agentSlug: agentSlug ?? null,
          pendingInterrupt: (pendingInterrupt ?? null) as
            import('@/features/chat').PendingInterrupt | null,
          greeting,
          currentAgentName,
          projectSelector: threadId ? null : (
            <ProjectSelector
              projects={projects.data ?? []}
              projectsLoading={projects.isPending}
              projectsError={
                projects.error instanceof Error ? projects.error.message : null
              }
              onReloadProjects={() => void projects.refetch()}
              selected={selectedProjectId}
              disabled={creatingThread}
              onChange={setSelectedProjectId}
              history={{
                query: historyQuery,
                items: historyCandidates.data?.items ?? [],
                loading: historyCandidates.isPending,
                error:
                  historyCandidates.error instanceof Error
                    ? historyCandidates.error.message
                    : null,
                onQueryChange: setHistoryQuery,
              }}
              onCreateProject={async ({ name, path, requestId }) => {
                const project = await createProject.mutateAsync({
                  requestId,
                  name,
                  path,
                });
                // 新项目建好就直接选中它：用户点「创建」的意图就是要用它
                setSelectedProjectId(project.id);
              }}
            />
          ),
        }}
        statePanel={{
          open: panel.stateOpen,
          mode: panel.stateMode,
          agentState: runtime?.agentState ?? null,
          refreshing: stateRefreshing,
          onRefresh: () => void refreshState(),
          onOpenPreviewFile: openThreadPreview,
          onOpenSubagent: openSubagentSection,
        }}
        sidePanel={{
          ...panel,
          sections: panel.sections,
          activeSectionKey: panel.activeSectionKey,
          maximized: panel.maximized,
          open: panel.open,
          resizing: panel.resizing,
          width: panel.width,
          rowRef: panel.rowRef,
          onActivateSection: panel.setActiveSectionKey,
          onCloseSection: panel.closeSection,
          onToggleMaximize: panel.toggleMaximize,
          onClose: () => panel.setOpen(false),
          onResize: panel.onResize,
          onResizeEnd: panel.endResize,
          // 按当前激活的文件分区取内容：用 panelPreview.current 会让每个预览 tab
          // 都显示「最后打开的那个文件」
          previewFile: activeFileSection
            ? panelPreview.previewFor({
                scope: activeFileSection.scope ?? 'thread',
                path: activeFileSection.path ?? '',
              })
            : panelPreview.current,
          onPreviewDownload: (file) => {
            void panelPreview.download({
              scope: treeScope,
              path: file.path,
              name: file.name,
            });
          },
          onPreviewClose: (sectionKey) => {
            panelPreview.close();
            panel.closeSection(sectionKey);
          },
          treeScope,
          onTreeScopeChange: setTreeScope,
          fileSearchQuery,
          onFileSearchQueryChange: (query) => {
            setFileSearchOpen(true);
            setFileSearchQuery(query);
          },
          fileSearchResults: fileSearch.data,
          scopeState:
            treeScope === 'workspace'
              ? panelFilesystem.workspace
              : panelFilesystem.thread,
          onPreviewOpen: (scope, path, name) => {
            panel.openSection({
              key: `file:${scope}:${path}`,
              type: 'file',
              title: name,
              path,
              scope,
            });
            panelPreview.open({ scope, path, name });
          },
          onPreviewDownloadByScope: (scope, path, name) => {
            void panelPreview.download({ scope, path, name });
          },
          onSelectPath: (path) => {
            // 面包屑点某一段：展开它的祖先（目录自身也展开）并选中它，不动其它分支。
            // 空路径是「回到作用域根」：只清选中，不动展开态
            panelFilesystem.setScopeState(treeScope, (current) =>
              path
                ? {
                    ...current,
                    expandedKeys: [
                      ...new Set([
                        ...current.expandedKeys,
                        ...pathBreadcrumbs(path).map((crumb) => crumb.path),
                      ]),
                    ],
                    selectedKeys: [path],
                  }
                : { ...current, selectedKeys: [] },
            );
          },
          onNodeExpand: (node) => {
            panelFilesystem.setScopeState(treeScope, (current) => ({
              ...current,
              expandedKeys: current.expandedKeys.includes(node.key)
                ? current.expandedKeys.filter((key) => key !== node.key)
                : [...current.expandedKeys, node.key],
              selectedKeys: [node.key],
            }));
          },
          onExpandedKeysChange: (keys) => {
            panelFilesystem.setScopeState(treeScope, (current) => ({
              ...current,
              expandedKeys: keys,
            }));
          },
          onLoadChildren: (node) => {
            if (treeScope === 'workspace') {
              void panelFilesystem.loadWorkspaceChildren(node);
            } else {
              void panelFilesystem.loadThreadChildren(node);
            }
          },
          onDeleteNode: (node) => {
            void panelFilesystem.deleteThreadNode(node);
          },
          onRetryTree: () => {
            if (treeScope === 'workspace') {
              void panelFilesystem.refreshWorkspaceTree({ force: true });
            } else {
              void panelFilesystem.refreshThreadTree();
            }
          },
          debugMessages: mergeMessageDebugMessages(
            messages as unknown as DebugMessage[],
            streamingMessages as unknown as DebugMessage[],
            runtime?.activeRunId ?? null,
          ),
          fetchLangfuseUrl: async (runId) => {
            const link = await agentRunApi.getRunLangfuseLink(runId);
            return link.url ?? null;
          },
        }}
        overlays={{
          attachmentOpen,
          onAttachmentOpenChange: setAttachmentOpen,
        }}
      />
    </ContentLayout>
  );
};
