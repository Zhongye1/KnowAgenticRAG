import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { paths } from '@/shared/config';

/**
 * 这套用例逐个靠 userEvent 驱动弹窗与表单，全套件并行跑时会超过默认 5 秒预算；
 * 与 `knowledge-file-table` 等重交互文件同一口径，给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const {
  chat,
  runtime,
  notifications,
  agentRunApi,
  chatOptions,
  session,
  modelGroups,
  projectList,
  historyQueryArgs,
  attachmentUpload,
  threadAttachments,
  refetchAttachments,
  cacheThreadAttachments,
} = vi.hoisted(() => ({
  session: { isSuperuser: true },
  // 可选模型列表；页面用例按需填，避免每个用例都写一遍
  modelGroups: [] as Array<Record<string, unknown>>,
  // 可选项目列表；同上
  projectList: [] as Array<Record<string, unknown>>,
  // 页面喂给历史候选查询的参数；用来证明它拿到的是防抖后的值
  historyQueryArgs: [] as unknown[],
  // 附件上传：确认动作要能被用例断言
  attachmentUpload: {
    confirm: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
    reset: vi.fn(),
  },
  // 会话里已确认的附件；用来证明「还没用掉的才随发送下发」
  threadAttachments: [] as Array<Record<string, unknown>>,
  refetchAttachments: vi.fn(),
  cacheThreadAttachments: vi.fn(),
  chat: {
    loadHistory: vi.fn(),
    createThread: vi.fn(),
    refreshQueue: vi.fn(),
    sendMessage: vi.fn(),
    cancelRun: vi.fn(),
    submitInterrupt: vi.fn(),
    steer: vi.fn(),
    cancelQueued: vi.fn(),
    continueQueue: vi.fn(),
    stopRequestStreams: vi.fn(),
  },
  runtime: {
    agentState: null as unknown,
    messages: [] as unknown[],
    queuedRequests: [] as unknown[],
    queueSnapshot: null as unknown,
    continueQueueInFlight: false,
    isStreaming: false,
    activeRunSteerable: false,
    pendingInterrupt: null as unknown,
    onGoingConv: { msgChunks: {} },
  },
  notifications: { addNotification: vi.fn() },
  agentRunApi: {
    getDefaultAgent: vi
      .fn()
      .mockResolvedValue({ agent: { slug: 'default-chatbot' } }),
    uploadImage: vi.fn(),
    getRunLangfuseLink: vi.fn(),
  },
  chatOptions: { current: null as null | Record<string, unknown> },
}));

// model 层的 hook 直接 import api 段（slice 内部引用，架构如此），
// 因此图片上传的拦截点在 api 模块，而不是 barrel 的 agentRunApi 导出。
vi.mock('@/features/chat/api/agent-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/chat/api/agent-api')
  >('@/features/chat/api/agent-api');
  return {
    ...actual,
    agentRunApi: {
      ...actual.agentRunApi,
      uploadImage: agentRunApi.uploadImage,
      getDefaultAgent: agentRunApi.getDefaultAgent,
      getRunLangfuseLink: agentRunApi.getRunLangfuseLink,
    },
  };
});

vi.mock('@/entities/session', () => ({
  useIsSuperuser: () => session.isSuperuser,
}));

vi.mock('@/features/chat', async () => {
  // 草稿与图片只依赖 localStorage 与 DOM，用真实实现；网络调用由 agentRunApi 桩替代
  const draft = await vi.importActual<
    typeof import('@/features/chat/lib/thread-draft')
  >('@/features/chat/lib/thread-draft');
  const draftInput = await vi.importActual<
    typeof import('@/features/chat/model/thread-draft-input')
  >('@/features/chat/model/thread-draft-input');
  const imageSlot = await vi.importActual<
    typeof import('@/features/chat/model/image-upload-slot')
  >('@/features/chat/model/image-upload-slot');
  const artifactActions = await vi.importActual<
    typeof import('@/features/chat/model/artifact-actions')
  >('@/features/chat/model/artifact-actions');
  const panelSectionsStore = await vi.importActual<
    typeof import('@/features/chat/model/panel-sections-store')
  >('@/features/chat/model/panel-sections-store');
  const agentOptionsQueries = await vi.importActual<
    typeof import('@/features/chat/model/agent-options-queries')
  >('@/features/chat/model/agent-options-queries');
  const imageUpload = await vi.importActual<
    typeof import('@/features/chat/lib/image-upload')
  >('@/features/chat/lib/image-upload');
  const preview = await vi.importActual<
    typeof import('@/features/chat/ui/image-attachment-preview')
  >('@/features/chat/ui/image-attachment-preview');
  const approval = await vi.importActual<
    typeof import('@/features/chat/lib/tool-approval')
  >('@/features/chat/lib/tool-approval');
  const selector = await vi.importActual<
    typeof import('@/features/chat/ui/tool-approval-mode-selector')
  >('@/features/chat/ui/tool-approval-mode-selector');
  const usageCard = await vi.importActual<
    typeof import('@/features/chat/ui/token-usage-card')
  >('@/features/chat/ui/token-usage-card');
  const tokenUsage = await vi.importActual<
    typeof import('@/features/chat/lib/token-usage')
  >('@/features/chat/lib/token-usage');
  const mentionResources = await vi.importActual<
    typeof import('@/features/chat/lib/mention-resources')
  >('@/features/chat/lib/mention-resources');
  const mentionText = await vi.importActual<
    typeof import('@/features/chat/lib/mention-text')
  >('@/features/chat/lib/mention-text');
  const mentionConfig = await vi.importActual<
    typeof import('@/features/chat/lib/mention-config')
  >('@/features/chat/lib/mention-config');
  const mentionEditor = await vi.importActual<
    typeof import('@/features/chat/ui/mention-editor')
  >('@/features/chat/ui/mention-editor');
  const panelSections = await vi.importActual<
    typeof import('@/features/chat/lib/panel-sections')
  >('@/features/chat/lib/panel-sections');
  const panelWidth = await vi.importActual<
    typeof import('@/features/chat/lib/panel-width')
  >('@/features/chat/lib/panel-width');
  const agentPanel = await vi.importActual<
    typeof import('@/features/chat/ui/agent-panel')
  >('@/features/chat/ui/agent-panel');
  const usageRing = await vi.importActual<
    typeof import('@/features/chat/ui/context-usage-ring')
  >('@/features/chat/ui/context-usage-ring');
  const agentOptions = await vi.importActual<
    typeof import('@/features/chat/lib/agent-options')
  >('@/features/chat/lib/agent-options');
  const agentSelector = await vi.importActual<
    typeof import('@/features/chat/ui/agent-selector')
  >('@/features/chat/ui/agent-selector');
  const queueView = await vi.importActual<
    typeof import('@/features/chat/lib/queue-view')
  >('@/features/chat/lib/queue-view');
  const modelSelection = await vi.importActual<
    typeof import('@/features/chat/model/model-selection')
  >('@/features/chat/model/model-selection');
  const modelSpec = await vi.importActual<
    typeof import('@/features/chat/lib/model-spec')
  >('@/features/chat/lib/model-spec');
  const modelSelector = await vi.importActual<
    typeof import('@/features/chat/ui/model-selector')
  >('@/features/chat/ui/model-selector');
  const projectSpec = await vi.importActual<
    typeof import('@/features/chat/lib/project-selection')
  >('@/features/chat/lib/project-selection');
  const subagentRun = await vi.importActual<
    typeof import('@/features/chat/lib/subagent-run')
  >('@/features/chat/lib/subagent-run');
  const replyStatus = await vi.importActual<
    typeof import('@/features/chat/lib/reply-status')
  >('@/features/chat/lib/reply-status');
  const threadTitle = await vi.importActual<
    typeof import('@/features/chat/lib/thread-title')
  >('@/features/chat/lib/thread-title');
  const stateReaders = await vi.importActual<
    typeof import('@/features/chat/lib/agent-state-readers')
  >('@/features/chat/lib/agent-state-readers');
  const projectSelector = await vi.importActual<
    typeof import('@/features/chat/ui/project-selector')
  >('@/features/chat/ui/project-selector');
  const composerOptions = await vi.importActual<
    typeof import('@/features/chat/ui/composer-options')
  >('@/features/chat/ui/composer-options');
  const attachmentLib = await vi.importActual<
    typeof import('@/features/chat/lib/attachment-upload')
  >('@/features/chat/lib/attachment-upload');
  return {
    buildAgentOptions: agentOptions.buildAgentOptions,
    AgentSelector: agentSelector.AgentSelector,
    AgentPanel: agentPanel.AgentPanel,
    ContextUsageRing: usageRing.ContextUsageRing,
    closeSection: panelSections.closeSection,
    MESSAGE_DEBUG_SECTION: panelSections.MESSAGE_DEBUG_SECTION,
    normalizeSections: panelSections.normalizeSections,
    upsertSection: panelSections.upsertSection,
    resizePanelWidth: panelWidth.resizePanelWidth,
    buildMentionDisplayLabels: mentionText.buildMentionDisplayLabels,
    buildMentionFileItems: mentionResources.buildMentionFileItems,
    buildMentionResourceItems: mentionResources.buildMentionResourceItems,
    buildMentionConfig: mentionConfig.buildMentionConfig,
    // 智能体配置是网络调用；给空配置，页面级用例只断言它按当前 slug 去取
    useAgentConfig: vi.fn(() => ({
      configurableItems: {},
      agentConfig: {},
      isLoading: false,
    })),
    MentionEditor: mentionEditor.MentionEditor,
    // 「+」面板用真实实现：页面用例要走真实的「+ → 添加附件」路径
    ComposerOptions: composerOptions.ComposerOptions,
    // 提及搜索是网络调用，这里给空结果；它的解析与归一由各自的单测覆盖
    searchMentionFiles: vi.fn(async () => []),
    isToolApprovalMode: approval.isToolApprovalMode,
    readToolApprovalModePreference: approval.readToolApprovalModePreference,
    resolveToolApprovalMode: approval.resolveToolApprovalMode,
    writeToolApprovalModePreference: approval.writeToolApprovalModePreference,
    ToolApprovalModeSelector: selector.ToolApprovalModeSelector,
    TokenUsageCard: usageCard.TokenUsageCard,
    readTokenUsage: tokenUsage.readTokenUsage,
    fetchAgentState: vi.fn(),
    DRAFT_THREAD_ID: draft.DRAFT_THREAD_ID,
    createThreadDraftStore: draft.createThreadDraftStore,
    createThreadDraftSession: draft.createThreadDraftSession,
    useThreadDraftInput: draftInput.useThreadDraftInput,
    useImageUploadSlot: imageSlot.useImageUploadSlot,
    useArtifactActions: artifactActions.useArtifactActions,
    useAgentPanelSections: panelSectionsStore.useAgentPanelSections,
    subagentRunSection: panelSectionsStore.subagentRunSection,
    subagentRunTitle: (
      await vi.importActual<typeof import('@/features/chat/lib/subagent-run')>(
        '@/features/chat/lib/subagent-run',
      )
    ).subagentRunTitle,
    useAgentOptions: agentOptionsQueries.useAgentOptions,
    SEND_COOLDOWN_MS: 0,
    isRunInterruptedConflict: (
      await vi.importActual<typeof import('@/features/chat/lib/tool-approval')>(
        '@/features/chat/lib/tool-approval',
      )
    ).isRunInterruptedConflict,
    ScrollController: (
      await vi.importActual<
        typeof import('@/features/chat/lib/scroll-controller')
      >('@/features/chat/lib/scroll-controller')
    ).ScrollController,
    findClipboardImage: imageUpload.findClipboardImage,
    normalizeUploadedImage: imageUpload.normalizeUploadedImage,
    validateImageFile: imageUpload.validateImageFile,
    ImageAttachmentPreview: preview.ImageAttachmentPreview,
    agentRunApi,
    describeQueueRow: () => ({ canSteer: true, canCancel: true }),
    // 引导的判定用真实实现：页面用例只证明「按判定的结果渲染入口并下发 steer」
    canSubmitDirectSteer: queueView.canSubmitDirectSteer,
    hasPendingDirectSteer: queueView.hasPendingDirectSteer,
    // 模型选择用真实实现与真实 store：页面用例证明「按回退链下发并写进覆盖表」
    ModelSelector: modelSelector.ModelSelector,
    useChatModels: () => ({ data: modelGroups, isPending: false }),
    useSystemDefaultModel: () => '',
    useModelOverride: modelSelection.useModelOverride,
    useModelSelection: modelSelection.useModelSelection,
    resolveModelSpec: modelSpec.resolveModelSpec,
    // 项目选择用真实实现：页面用例证明「入口只在没有会话时出现，并把 project_id 带进建线程」
    ProjectSelector: projectSelector.ProjectSelector,
    AUTO_PROJECT_ID: projectSpec.AUTO_PROJECT_ID,
    resolveProjectId: projectSpec.resolveProjectId,
    // 子智能体分区同步用真实实现：agentState 里没有运行态时不产生分区
    readSubagentRuns: subagentRun.readSubagentRuns,
    SubagentThreadView: () => null,
    Button: (await import('antd')).Button,
    Spinner: () => null,
    // 通知走适配层；页面用例直接断言 notifications.addNotification 的调用
    useNotifications: () => notifications,
    // 生成中状态条用真实判定与真实组件：页面用例只断言出现时机由 replyLoadingVisible 决定
    buildReplyLoadingStatus: replyStatus.buildReplyLoadingStatus,
    GeneratingStatus: () => null,
    // 标题生成是网络调用；页面用例不验证它，桩成空实现避免误打接口
    generateConversationTitle: vi.fn(async () => ''),
    fallbackTitleFromQuery: threadTitle.fallbackTitleFromQuery,
    useFastModel: () => 'fast-model-spec',
    // 状态分区用真实读取与真实组件：agentState 为空时渲染「暂无状态内容」
    readAgentStateTodos: stateReaders.readAgentStateTodos,
    readAgentStateFiles: stateReaders.readAgentStateFiles,
    readAgentStateArtifacts: stateReaders.readAgentStateArtifacts,
    StatePanel: ({
      onOpenFile,
    }: {
      onOpenFile?: (file: { path: string; name: string }) => void;
    }) => (
      <div data-testid="state-panel-stub">
        <button
          type="button"
          onClick={() => onOpenFile?.({ path: '/out/a.md', name: 'a.md' })}
        >
          状态里的文件
        </button>
        <button
          type="button"
          onClick={() => onOpenFile?.({ path: '/out/b.md', name: 'b.md' })}
        >
          状态里的文件 b
        </button>
      </div>
    ),
    useProjects: () => ({ data: projectList, isPending: false, error: null }),
    // 防抖用真实实现：它只是延迟，不影响页面的可观察结果
    HISTORY_SEARCH_DEBOUNCE_MS: 250,
    // 防抖本身有单测；这里返回一个标记值，用来证明页面把它喂进了查询
    useDebouncedValue: () => 'DEBOUNCED',
    useHistoryCandidates: (query: unknown) => {
      historyQueryArgs.push(query);

      return {
        data: { items: [], hasMore: false },
        isPending: false,
        error: null,
      };
    },
    useCreateLinkedProject: () => ({ mutateAsync: vi.fn() }),
    // 附件：hook 与弹窗都换桩，页面用例只证明「确认前把会话准备好」这条编排
    useAttachmentUpload: () => attachmentUpload,
    // 文件树：面板测试桩掉树的状态，页面用例只关心分区与编排
    FILE_TREE_SECTION: { key: 'file-tree', type: 'file-tree', title: '文件' },
    PANEL_TREE_SCOPES: [
      { key: 'thread', label: '对话目录' },
      { key: 'workspace', label: '个人空间' },
    ],
    shouldPollPanelFilesystem: () => false,
    usePanelFilesystem: () => ({
      thread: {
        nodes: [],
        selectedKeys: [],
        expandedKeys: [],
        loading: false,
        error: null,
        deletingPaths: [],
      },
      workspace: {
        nodes: [],
        selectedKeys: [],
        expandedKeys: [],
        loading: false,
        error: null,
        deletingPaths: [],
      },
      refreshThreadTree: vi.fn(async () => undefined),
      loadThreadChildren: vi.fn(async () => undefined),
      deleteThreadNode: vi.fn(async () => true),
      refreshWorkspaceTree: vi.fn(async () => undefined),
      loadWorkspaceChildren: vi.fn(async () => undefined),
      setScopeState: vi.fn(),
    }),
    FileTree: () => <div data-testid="file-tree-stub" />,
    FilePreview: ({ file }: { file: { path: string } | null }) => (
      <div data-testid="file-preview-stub">{file?.path ?? '无'}</div>
    ),
    usePanelFileSearch: () => ({ data: [], isPending: false, error: null }),
    useDebounce: (value: unknown) => value,
    usePanelPreview: () => ({
      current: null,
      previewFor: vi.fn(({ path }: { path: string }) => ({
        path,
        name: path.split('/').pop() ?? path,
        status: 'ready' as const,
        previewType: 'text' as const,
        supported: true,
        content: 'x',
        previewUrl: '',
        message: '',
        truncated: false,
      })),
      open: vi.fn(),
      close: vi.fn(),
      reload: vi.fn(async () => undefined),
    }),
    useThreadAttachments: () => ({
      data: threadAttachments,
      refetch: refetchAttachments,
    }),
    useCacheThreadAttachments: () => cacheThreadAttachments,
    // 「还没被用掉」的判据用真实实现：预览与下发的 id 必须同源
    pendingThreadAttachments: attachmentLib.pendingThreadAttachments,
    pendingAttachmentFileIds: attachmentLib.pendingAttachmentFileIds,
    formatFileSize: attachmentLib.formatFileSize,
    useDefaultOcrEngine: () => '',
    AttachmentUploadDialog: ({
      open,
      onConfirm,
    }: {
      open: boolean;
      onConfirm: () => Promise<void>;
    }) =>
      open ? (
        <button type="button" onClick={() => void onConfirm()}>
          确认附件
        </button>
      ) : null,
    isThreadWaitingForUserAction: () => false,
    describeQueue: () => ({
      visible: false,
      pendingCount: 0,
      paused: false,
      pausedReason: null,
      canContinue: false,
    }),
    PendingInterruptPanel: () => null,
    QueueBar: () => null,
    MessageList: () => null,
    MessageDebugPanel: ({ messages }: { messages: unknown[] }) => (
      <div data-testid="message-debug-panel">{messages.length} 条</div>
    ),
    mergeMessageDebugMessages: (history: unknown[], ongoing: unknown[]) => [
      ...(history ?? []),
      ...(ongoing ?? []),
    ],
    // 对话页只从切片取状态选择器，真正的会话列表 store 单独测
    useThreadList: (selector: (state: unknown) => unknown) =>
      selector(threadList),
    ConversationList: () => <div data-testid="conversation-list-stub" />,
    useStreamingMessages: () => [],
    useChatRuntime: (options: Record<string, unknown>) => {
      chatOptions.current = options;
      return chat;
    },
    useThreadRuntime: () => runtime,
  };
});

vi.mock('@/shared/ui/notifications', () => ({
  // 对话页只按选择器取稳定的 addNotification，桩要跟着支持选择器形式
  useNotifications: (selector?: (state: unknown) => unknown) =>
    selector ? selector(notifications) : notifications,
}));

const { threadList } = vi.hoisted(() => ({
  threadList: {
    agentSlug: 'default-chatbot',
    agentToolApprovalMode: null as string | null,
    threads: [] as Array<Record<string, unknown>>,
    ensureAgentSlug: vi.fn(),
    upsert: vi.fn(),
    rename: vi.fn(async () => true),
    setToolApprovalMode: vi.fn(),
    setModelSpec: vi.fn(),
    markViewed: vi.fn(),
  },
}));

vi.mock('@/features/chat/model/thread-list-store', () => ({
  useThreadList: (selector: (state: unknown) => unknown) =>
    selector(threadList),
}));

vi.mock('@/shared/ui/content-layout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { ChatPage } = await import('@/pages/chat/ui/chat-page');
const { useModelSelection } =
  await import('@/features/chat/model/model-selection');
// antd 词汇由应用装配承载，测试同构挂上
const { AntdProvider } = await import('@/app/theme/antd-provider');

/**
 * 复刻真实路由形状：`/agent` 与 `/agent/:threadId` 共用同一个组件实例。
 * 同时套上 `StrictMode`，与 `pnpm dev` 的挂载行为一致。
 */
function renderAt(initialPath: string) {
  // 对话页要读知识库列表来把 kb_id 翻成名称，因此需要 QueryClient
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <React.StrictMode>
      <AntdProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path={paths.app.chat.path} element={<ChatPage />} />
              <Route
                path={`${paths.app.chat.path}/:threadId`}
                element={<ChatPage />}
              />
            </Routes>
            <NewChatLink />
            <SwitchThreadLink />
            <BackToThreadALink />
          </MemoryRouter>
        </QueryClientProvider>
      </AntdProvider>
    </React.StrictMode>,
  );
}

const send = async (text = '你好') => {
  await userEvent.type(await screen.findByLabelText('消息输入'), text);
  await userEvent.click(screen.getByRole('button', { name: '发送' }));
};

/** 侧边栏「新建对话」的真实入口：回到没有线程的地址。 */
const NewChatLink = () => <Link to={paths.app.chat.getHref()}>新建对话</Link>;

/** 线程列表里的真实入口：切到另一条线程。 */
const SwitchThreadLink = () => (
  <Link to={paths.app.chat.getHref('thread-B')}>切到 B</Link>
);

/** 切回原线程，用来验证草稿是否被带回来。 */
const BackToThreadALink = () => (
  <Link to={paths.app.chat.getHref('thread-A')}>回到 A</Link>
);

/** 造一份剪贴板数据：`items` 与 `files` 的形状与浏览器一致。 */
const clipboardWith = (
  items: Array<{ kind: string; type: string; file: File | null }>,
  files: File[] = [],
) =>
  ({
    items: items.map((item) => ({
      kind: item.kind,
      type: item.type,
      getAsFile: () => item.file,
    })),
    files,
  }) as unknown as DataTransfer;

/** 粘贴：返回值即 dispatchEvent 的结果，false 表示默认行为被拦下。 */
const pasteInto = (clipboardData: DataTransfer) =>
  fireEvent.paste(screen.getByLabelText('消息输入'), { clipboardData });

/** 选图：真实页面里是隐藏的文件输入，用 change 事件驱动。 */
const pickImage = (name = '截图.png', type = 'image/png') => {
  fireEvent.change(screen.getByLabelText('选择图片'), {
    target: { files: [new File(['x'], name, { type })] },
  });
};

/** 打开附件上传弹窗：附件入口在「+」展开面板里，走真实的两步路径。 */
const openAttachmentDialog = async () => {
  await userEvent.click(
    await screen.findByRole('button', { name: '添加内容' }),
  );
  await userEvent.click(
    // 面板项是 role=menuitem 的按钮，显式 role 会盖掉隐式的 button
    await screen.findByRole('menuitem', { name: '添加附件' }),
  );
};

describe('对话页的线程生命周期', () => {
  beforeEach(() => {
    window.localStorage.clear();
    for (const fn of Object.values(chat)) fn.mockReset();
    notifications.addNotification.mockReset();
    chat.loadHistory.mockResolvedValue(undefined);
    chat.refreshQueue.mockResolvedValue(undefined);
    chat.sendMessage.mockResolvedValue(undefined);
    chat.createThread.mockResolvedValue({
      id: 'thread-新',
      agent_id: 'default-chatbot',
      title: '你好',
    });
    threadList.ensureAgentSlug.mockReset().mockResolvedValue('default-chatbot');
    threadList.upsert.mockReset();
    threadList.setToolApprovalMode.mockReset().mockResolvedValue(true);
    threadList.markViewed.mockReset().mockResolvedValue(true);
    chatOptions.current = null;
    runtime.agentState = null;
    session.isSuperuser = true;
    runtime.messages = [];
    runtime.isStreaming = false;
    runtime.activeRunSteerable = false;
    runtime.queuedRequests = [];
    runtime.queueSnapshot = null;
    modelGroups.length = 0;
    projectList.length = 0;
    historyQueryArgs.length = 0;
    attachmentUpload.confirm.mockReset().mockResolvedValue([]);
    attachmentUpload.reset.mockReset();
    threadAttachments.length = 0;
    refetchAttachments.mockReset();
    cacheThreadAttachments.mockReset();
    useModelSelection.setState({ overrideByKey: {} });
    threadList.agentToolApprovalMode = null;
    threadList.threads = [];
    // 忠实桩：真实现会就地改会话 metadata，页面用例要能观察这条链路
    threadList.setModelSpec.mockImplementation(
      (threadId: string, spec: string) => {
        threadList.threads = threadList.threads.map((item) =>
          item.id === threadId
            ? {
                ...item,
                metadata: {
                  ...(item.metadata as Record<string, unknown>),
                  model_spec: spec,
                },
              }
            : item,
        );
      },
    );
    agentRunApi.uploadImage.mockReset();
  });

  it('超管能打开消息调试面板，面板拿到当前线程的消息', async () => {
    session.isSuperuser = true;
    runtime.messages = [
      { id: 'm-1', type: 'human', content: '你好' },
      { id: 'm-2', type: 'ai', content: '你好呀' },
    ];
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(await screen.findByRole('button', { name: '调试' }));

    expect(await screen.findByTestId('message-debug-panel')).toHaveTextContent(
      '2 条',
    );
    await userEvent.click(
      screen.getByRole('button', { name: '调试', pressed: true }),
    );
    expect(screen.queryByTestId('message-debug-panel')).toBeNull();
  });

  it('非超管看不到消息调试入口', async () => {
    session.isSuperuser = false;
    renderAt(paths.app.chat.getHref('thread-A'));

    await screen.findByRole('button', { name: '发送' });
    expect(screen.queryByRole('button', { name: /消息调试/ })).toBeNull();
  });

  it('地址没有线程时先建线程，再用新线程发送', async () => {
    renderAt(paths.app.chat.getHref());

    await send();

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith({
        threadId: 'thread-新',
        agentSlug: 'default-chatbot',
        query: '你好',
        imageContent: null,
        // 用户没有显式选过：留空让后端按智能体配置与默认值解析
        toolApprovalMode: null,
        // 普通发送走队尾；只有引导按钮才传 steer
        queuePolicy: 'enqueue',
        // 没有显式选择也没有会话绑定时不下发模型，交给后端解析
        modelSpec: null,
        // 这条会话还没有附件
        attachmentFileIds: [],
        // 附件是单次使用的：请求受理后要刷新列表
        onAccepted: expect.any(Function),
      }),
    );
    // 新线程要立刻出现在侧边栏列表里，不必再拉一次
    expect(threadList.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'thread-新', agent_id: 'default-chatbot' }),
    );
    expect(chat.createThread).toHaveBeenCalledWith(
      'default-chatbot',
      '你好',
      null,
      '',
    );
  });

  it('地址已有线程时不建新线程，直接用该线程发送', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await send();

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith({
        threadId: 'thread-A',
        agentSlug: 'default-chatbot',
        query: '你好',
        imageContent: null,
        // 用户没有显式选过：留空让后端按智能体配置与默认值解析
        toolApprovalMode: null,
        // 普通发送走队尾；只有引导按钮才传 steer
        queuePolicy: 'enqueue',
        // 没有显式选择也没有会话绑定时不下发模型，交给后端解析
        modelSpec: null,
        // 这条会话还没有附件
        attachmentFileIds: [],
        // 附件是单次使用的：请求受理后要刷新列表
        onAccepted: expect.any(Function),
      }),
    );
    expect(chat.createThread).not.toHaveBeenCalled();
    expect(threadList.upsert).not.toHaveBeenCalled();
  });

  it('建线程失败时保留输入并提示，不静默丢弃', async () => {
    chat.createThread.mockRejectedValue(new Error('智能体不存在'));
    renderAt(paths.app.chat.getHref());

    await send();

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: '智能体不存在' }),
      ),
    );
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByLabelText('消息输入').textContent).toBe('你好');
  });

  it('建过线程后点「新建对话」再发送，会再建一条而不是串回上一条', async () => {
    chat.createThread
      .mockResolvedValueOnce({
        id: 'thread-新1',
        agent_id: 'default-chatbot',
        title: '第一条',
      })
      .mockResolvedValueOnce({
        id: 'thread-新2',
        agent_id: 'default-chatbot',
        title: '第二条',
      });
    renderAt(paths.app.chat.getHref());

    await send('第一条');
    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ threadId: 'thread-新1' }),
      ),
    );

    await userEvent.click(screen.getByRole('link', { name: '新建对话' }));
    await send('第二条');

    // 地址已经回到 /agent，此时必须重新建线程，不能复用上一条
    await waitFor(() => expect(chat.createThread).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ threadId: 'thread-新2', query: '第二条' }),
      ),
    );
  });

  it('离开线程时断开它的排队事件流', async () => {
    const { unmount } = renderAt(paths.app.chat.getHref('thread-A'));

    await waitFor(() => expect(chat.refreshQueue).toHaveBeenCalled());
    unmount();

    expect(chat.stopRequestStreams).toHaveBeenCalledWith('thread-A');
  });

  it('从 A 切到 B 时只断开 A 的排队事件流', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));
    await waitFor(() =>
      expect(chat.refreshQueue).toHaveBeenCalledWith(
        'thread-A',
        'default-chatbot',
      ),
    );
    // 丢掉挂载期 StrictMode 双调用产生的清理记录，只看切线程这一次
    chat.stopRequestStreams.mockClear();

    await userEvent.click(screen.getByRole('link', { name: '切到 B' }));

    await waitFor(() =>
      expect(chat.stopRequestStreams).toHaveBeenCalledWith('thread-A'),
    );
    expect(chat.stopRequestStreams).not.toHaveBeenCalledWith('thread-B');
  });

  it('建线程期间用户离开页面时放弃这次发送', async () => {
    let resolveCreate!: (id: string) => void;
    chat.createThread.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const { unmount } = renderAt(paths.app.chat.getHref());

    await send();
    unmount();
    resolveCreate('thread-新');

    await waitFor(() => expect(chat.createThread).toHaveBeenCalledTimes(1));
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it('切到别的线程再切回来，未发送的输入仍在', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.type(
      await screen.findByLabelText('消息输入'),
      '还没发出去',
    );
    await userEvent.click(screen.getByRole('link', { name: '切到 B' }));
    await waitFor(() =>
      expect(screen.getByLabelText('消息输入').textContent).toBe(''),
    );
    // 切走不能把 A 的未发送文本写进 B：写串键会让 B 刷新后冒出别人的草稿
    expect(
      window.localStorage.getItem('ars:thread-input-draft:thread-B'),
    ).toBeNull();
    expect(window.localStorage.getItem('ars:thread-input-draft:thread-A')).toBe(
      '还没发出去',
    );

    await userEvent.click(screen.getByRole('link', { name: '回到 A' }));

    await waitFor(() =>
      expect(screen.getByLabelText('消息输入').textContent).toBe('还没发出去'),
    );
  });

  it('未发送的输入落盘：重新进入页面（刷新）后仍在', async () => {
    const first = renderAt(paths.app.chat.getHref('thread-A'));
    await userEvent.type(
      await screen.findByLabelText('消息输入'),
      '刷新前的草稿',
    );
    first.unmount();

    // 直接断言落盘结果：只比输入框的值，内存缓存也能骗过用例
    expect(window.localStorage.getItem('ars:thread-input-draft:thread-A')).toBe(
      '刷新前的草稿',
    );

    renderAt(paths.app.chat.getHref('thread-A'));

    expect(screen.getByLabelText('消息输入').textContent).toBe('刷新前的草稿');
  });

  it('发送成功后不留草稿，回到新建对话不会还原已发送的文本', async () => {
    renderAt(paths.app.chat.getHref());

    await send('你好');
    await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('link', { name: '新建对话' }));

    await waitFor(() =>
      expect(screen.getByLabelText('消息输入').textContent).toBe(''),
    );
  });

  it('选图后出现预览，发送时带上 image_content 并清空图片槽', async () => {
    agentRunApi.uploadImage.mockResolvedValue({
      success: true,
      image_content: 'iVBORw0KGgoAAA',
      mime_type: 'image/png',
    });
    renderAt(paths.app.chat.getHref('thread-A'));

    pickImage('截图.png');

    expect(await screen.findByTestId('image-attachment')).toBeTruthy();
    // 只有图片、正文为空时也能发
    await userEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: 'thread-A',
          imageContent: 'iVBORw0KGgoAAA',
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('image-attachment')).toBeNull(),
    );
  });

  it('切到别的线程时清空待发送图片，避免把 A 的图发给 B', async () => {
    agentRunApi.uploadImage.mockResolvedValue({
      success: true,
      image_content: 'iVBORw0KGgoAAA',
    });
    renderAt(paths.app.chat.getHref('thread-A'));
    pickImage();
    expect(await screen.findByTestId('image-attachment')).toBeTruthy();

    await userEvent.click(screen.getByRole('link', { name: '切到 B' }));

    await waitFor(() =>
      expect(screen.queryByTestId('image-attachment')).toBeNull(),
    );
  });

  it('上传失败时提示原因，图片槽保持为空', async () => {
    agentRunApi.uploadImage.mockRejectedValue(
      new Error('图片文件过大，请上传小于10MB的图片'),
    );
    renderAt(paths.app.chat.getHref('thread-A'));

    pickImage();

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: '图片文件过大，请上传小于10MB的图片',
        }),
      ),
    );
    expect(screen.queryByTestId('image-attachment')).toBeNull();
  });

  it('非图片文件在本地就被拒绝，不会发起上传', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    pickImage('说明.txt', 'text/plain');

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ message: '只能上传图片文件' }),
      ),
    );
    expect(agentRunApi.uploadImage).not.toHaveBeenCalled();
  });

  it('粘贴图片时拦下默认行为并上传', async () => {
    agentRunApi.uploadImage.mockResolvedValue({
      success: true,
      image_content: 'iVBORw0KGgoAAA',
      mime_type: 'image/png',
    });
    renderAt(paths.app.chat.getHref('thread-A'));

    const handled = pasteInto(
      clipboardWith([
        {
          kind: 'file',
          type: 'image/png',
          file: new File(['x'], 'pasted.png', { type: 'image/png' }),
        },
      ]),
    );

    expect(handled).toBe(false);
    await waitFor(() =>
      expect(agentRunApi.uploadImage).toHaveBeenCalledTimes(1),
    );
    expect(await screen.findByTestId('image-attachment')).toBeTruthy();
  });

  it('粘贴文本不拦默认行为，也不触发上传', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    const handled = pasteInto(clipboardWith([]));

    expect(handled).toBe(true);
    expect(agentRunApi.uploadImage).not.toHaveBeenCalled();
    expect(screen.queryByTestId('image-attachment')).toBeNull();
  });

  it('上传中不允许发送，上传完成后恢复', async () => {
    let resolveUpload!: (value: unknown) => void;
    agentRunApi.uploadImage.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    renderAt(paths.app.chat.getHref('thread-A'));
    // 先有正文：这样「发送被禁用」只可能来自上传中的守卫
    await userEvent.type(await screen.findByLabelText('消息输入'), '你好');

    pickImage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '发送' })).toBeDisabled(),
    );

    resolveUpload({ success: true, image_content: 'iVBORw0KGgoAAA' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '发送' })).toBeEnabled(),
    );
  });

  it('切线程后迟到的上传响应不回填，图片不会串到新线程', async () => {
    let resolveUpload!: (value: unknown) => void;
    agentRunApi.uploadImage.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    renderAt(paths.app.chat.getHref('thread-A'));

    pickImage();
    await userEvent.click(screen.getByRole('link', { name: '切到 B' }));
    resolveUpload({ success: true, image_content: 'iVBORw0KGgoAAA' });

    // 给迟到的响应留出一次微任务，它不该把 A 的图写进 B
    await waitFor(() => expect(agentRunApi.uploadImage).toHaveBeenCalled());
    expect(screen.queryByTestId('image-attachment')).toBeNull();

    await userEvent.click(screen.getByRole('link', { name: '回到 A' }));
    expect(screen.queryByTestId('image-attachment')).toBeNull();
  });

  it('建线程失败时图片留在槽里，可以直接重发', async () => {
    agentRunApi.uploadImage.mockResolvedValue({
      success: true,
      image_content: 'iVBORw0KGgoAAA',
    });
    chat.createThread.mockRejectedValue(new Error('智能体不存在'));
    renderAt(paths.app.chat.getHref());
    pickImage();
    expect(await screen.findByTestId('image-attachment')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ message: '智能体不存在' }),
      ),
    );
    expect(screen.getByTestId('image-attachment')).toBeTruthy();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it('新建对话选择审批模式只记本地偏好，随后随建线程与发送下发', async () => {
    renderAt(paths.app.chat.getHref());

    await userEvent.click(screen.getByRole('button', { name: '请求审批' }));
    await userEvent.click(
      await screen.findByRole('option', { name: '完全信任' }),
    );

    expect(window.localStorage.getItem('ars_tool_approval_mode')).toBe(
      'always_trust',
    );
    expect(threadList.setToolApprovalMode).not.toHaveBeenCalled();

    await send();

    await waitFor(() =>
      expect(chat.createThread).toHaveBeenCalledWith(
        'default-chatbot',
        '你好',
        'always_trust',
        '',
      ),
    );
    expect(chat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ toolApprovalMode: 'always_trust' }),
    );
  });

  it('在线程里选择审批模式时写到该线程，保存成功后才记本地偏好', async () => {
    threadList.threads = [{ id: 'thread-A', agent_id: 'default-chatbot' }];
    let settleSave!: (ok: boolean) => void;
    threadList.setToolApprovalMode.mockReturnValue(
      new Promise((resolve) => {
        settleSave = resolve;
      }),
    );
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(screen.getByRole('button', { name: '请求审批' }));
    await userEvent.click(
      await screen.findByRole('option', { name: '完全信任' }),
    );

    expect(threadList.setToolApprovalMode).toHaveBeenCalledWith(
      'thread-A',
      'always_trust',
    );
    // 请求还在飞：偏好不能先落下，否则失败的保存会改变之后所有新线程
    expect(window.localStorage.getItem('ars_tool_approval_mode')).toBeNull();

    settleSave(true);
    await waitFor(() =>
      expect(window.localStorage.getItem('ars_tool_approval_mode')).toBe(
        'always_trust',
      ),
    );
  });

  it('线程自己没有模式时，显示与下发的都是本地偏好', async () => {
    // 历史线程的 metadata 里没有该字段是常态：显示与生效必须一致
    window.localStorage.setItem('ars_tool_approval_mode', 'always_trust');
    threadList.threads = [{ id: 'thread-A', agent_id: 'default-chatbot' }];
    renderAt(paths.app.chat.getHref('thread-A'));

    expect(
      await screen.findByRole('button', { name: '完全信任' }),
    ).toBeTruthy();

    await send();

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ toolApprovalMode: 'always_trust' }),
      ),
    );
  });

  it('线程里保存失败：提示失败，且不改本地偏好', async () => {
    threadList.threads = [{ id: 'thread-A', agent_id: 'default-chatbot' }];
    threadList.setToolApprovalMode.mockResolvedValue(false);
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(screen.getByRole('button', { name: '请求审批' }));
    await userEvent.click(
      await screen.findByRole('option', { name: '完全信任' }),
    );

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ message: '审批模式保存失败' }),
      ),
    );
    // 失败的保存不能在本地留下偏好，否则它会静默改变之后所有新建对话
    expect(window.localStorage.getItem('ars_tool_approval_mode')).toBeNull();
  });

  it('线程没有显式模式时不下发，交给后端按智能体配置解析', async () => {
    threadList.threads = [{ id: 'thread-A', agent_id: 'default-chatbot' }];
    renderAt(paths.app.chat.getHref('thread-A'));

    await send();

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: 'thread-A',
          toolApprovalMode: null,
        }),
      ),
    );
  });

  it('线程 metadata 里的非法模式按无显式选择处理', async () => {
    threadList.threads = [
      {
        id: 'thread-A',
        agent_id: 'default-chatbot',
        metadata: { tool_approval_mode: 'auto' },
      },
    ];
    renderAt(paths.app.chat.getHref('thread-A'));

    expect(
      await screen.findByRole('button', { name: '请求审批' }),
    ).toBeTruthy();

    await send();

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ toolApprovalMode: null }),
      ),
    );
  });

  it('发送时带上线程 metadata 里的审批模式', async () => {
    threadList.threads = [
      {
        id: 'thread-A',
        agent_id: 'default-chatbot',
        metadata: { tool_approval_mode: 'always_trust' },
      },
    ];
    renderAt(paths.app.chat.getHref('thread-A'));

    await send();

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: 'thread-A',
          toolApprovalMode: 'always_trust',
        }),
      ),
    );
  });

  it('没有线程与本地偏好时用智能体配置里的默认审批模式', async () => {
    threadList.agentToolApprovalMode = 'always_trust';
    renderAt(paths.app.chat.getHref());

    // 触发器显示的就是当前生效的模式
    expect(
      await screen.findByRole('button', { name: '完全信任' }),
    ).toBeTruthy();
  });

  it('打开线程即标记已读，避免侧边栏一直挂着未读点', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await waitFor(() =>
      expect(threadList.markViewed).toHaveBeenCalledWith('thread-A'),
    );
  });

  it('当前线程的 run 收尾或中断时标记已读', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));
    await waitFor(() => expect(chatOptions.current).not.toBeNull());
    threadList.markViewed.mockClear();

    (chatOptions.current?.onRunSettled as (threadId: string) => void)(
      'thread-A',
    );

    expect(threadList.markViewed).toHaveBeenCalledWith('thread-A');
  });

  it('后台线程收尾不标记已读，未读点要留给用户', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));
    await waitFor(() => expect(chatOptions.current).not.toBeNull());
    threadList.markViewed.mockClear();

    (chatOptions.current?.onRunSettled as (threadId: string) => void)(
      'thread-B',
    );

    expect(threadList.markViewed).not.toHaveBeenCalled();
  });

  it('新建对话（没有线程）不标记已读', async () => {
    renderAt(paths.app.chat.getHref());

    await waitFor(() => expect(threadList.ensureAgentSlug).toHaveBeenCalled());
    expect(threadList.markViewed).not.toHaveBeenCalled();
  });

  it('用量快照的消费收进状态分区，页面顶部不再有独立用量卡', async () => {
    runtime.agentState = {
      token_usage: {
        llm_input_tokens: 2048,
        context_window: 4096,
        llm_messages_tokens: 1024,
      },
    };
    renderAt(paths.app.chat.getHref('thread-A'));

    // 面板默认关闭；页面消息区上方不应再有孤立的用量卡
    await screen.findByLabelText('消息输入');
    expect(screen.queryByTestId('token-usage')).not.toBeInTheDocument();
  });

  it('没有用量快照时不渲染用量卡片', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await waitFor(() => expect(threadList.markViewed).toHaveBeenCalled());
    expect(screen.queryByTestId('token-usage')).toBeNull();
  });

  it('把线程 state 拉取接到运行时回调上，传的是当前线程', async () => {
    const { fetchAgentState } = await import('@/features/chat');
    renderAt(paths.app.chat.getHref('thread-A'));
    await waitFor(() => expect(chatOptions.current).not.toBeNull());

    (
      chatOptions.current?.fetchAgentState as (
        agentId: string | undefined,
        stateThreadId: string,
      ) => void
    )(undefined, 'thread-A');

    expect(fetchAgentState).toHaveBeenCalledWith('thread-A');
  });

  it('提及候选按当前智能体的配置取，传的是会话里的 slug', async () => {
    const { useAgentConfig } = await import('@/features/chat');
    renderAt(paths.app.chat.getHref('thread-A'));

    await waitFor(() =>
      expect(useAgentConfig).toHaveBeenCalledWith('default-chatbot'),
    );
  });

  it('运行中把当前输入作为引导发出，请求带 queue_policy: steer', async () => {
    runtime.isStreaming = true;
    runtime.activeRunSteerable = true;
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.type(await screen.findByLabelText('消息输入'), '先看这个');
    await userEvent.click(await screen.findByRole('button', { name: '引导' }));

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ queuePolicy: 'steer', query: '先看这个' }),
      ),
    );
  });

  it('活跃 run 不可引导时不渲染引导入口', async () => {
    runtime.isStreaming = true;
    runtime.activeRunSteerable = false;
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.type(await screen.findByLabelText('消息输入'), '先看这个');
    expect(screen.queryByRole('button', { name: '引导' })).toBeNull();
  });

  it('队列里已有等待执行的引导时不渲染引导入口', async () => {
    runtime.isStreaming = true;
    runtime.activeRunSteerable = true;
    runtime.queuedRequests = [
      { request_id: 'r-引导', queue_policy: 'steer', status: 'queued' },
    ];
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.type(await screen.findByLabelText('消息输入'), '再看这个');
    expect(screen.queryByRole('button', { name: '引导' })).toBeNull();
  });

  it('已经派发过的引导不再挡住后续引导', async () => {
    runtime.isStreaming = true;
    runtime.activeRunSteerable = true;
    runtime.queuedRequests = [
      { request_id: 'r-引导', queue_policy: 'steer', status: 'dispatched' },
    ];
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.type(await screen.findByLabelText('消息输入'), '再看这个');
    expect(await screen.findByRole('button', { name: '引导' })).toBeTruthy();
  });

  it('建线程在途时按回车不再提交第二条', async () => {
    // 建线程是一次网络往返，输入要到它成功之后才清空；这期间发送按钮已经禁用，
    // 但输入框的回车不走按钮，是第二个真实入口。
    let resolveCreate: ((value: unknown) => void) | undefined;
    chat.createThread.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderAt(paths.app.chat.getHref());

    await userEvent.type(await screen.findByLabelText('消息输入'), '你好');
    await userEvent.click(screen.getByRole('button', { name: '发送' }));
    await userEvent.type(screen.getByLabelText('消息输入'), '{Enter}');

    resolveCreate?.({
      id: 'thread-新',
      agent_id: 'default-chatbot',
      title: '你好',
    });

    // 用户可见的结果：只发出一条消息
    await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledTimes(1));
    expect(chat.createThread).toHaveBeenCalledTimes(1);
  });

  it('引导只发文字，暂存的图片留在槽里', async () => {
    runtime.isStreaming = true;
    runtime.activeRunSteerable = true;
    agentRunApi.uploadImage.mockResolvedValue({
      success: true,
      image_content: 'iVBORw0KGgoAAA',
      mime_type: 'image/png',
    });
    renderAt(paths.app.chat.getHref('thread-A'));
    pickImage('截图.png');
    expect(await screen.findByTestId('image-attachment')).toBeTruthy();

    await userEvent.type(await screen.findByLabelText('消息输入'), '先看这个');
    await userEvent.click(await screen.findByRole('button', { name: '引导' }));

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ queuePolicy: 'steer', imageContent: null }),
      ),
    );
    // 图片没发出去，就不该顺手清掉
    expect(screen.queryByTestId('image-attachment')).toBeTruthy();
  });

  it('引导失败时把输入还原', async () => {
    runtime.isStreaming = true;
    runtime.activeRunSteerable = true;
    chat.sendMessage.mockRejectedValue(new Error('引导被拒绝'));
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.type(await screen.findByLabelText('消息输入'), '先看这个');
    await userEvent.click(await screen.findByRole('button', { name: '引导' }));

    await waitFor(() =>
      expect(screen.getByLabelText('消息输入')).toHaveTextContent('先看这个'),
    );
  });

  it('没有显式选择时下发会话绑定的模型', async () => {
    threadList.threads = [
      { id: 'thread-A', metadata: { model_spec: 'p:bound' } },
    ];
    renderAt(paths.app.chat.getHref('thread-A'));

    await send('你好');

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ modelSpec: 'p:bound' }),
      ),
    );
  });

  it('选中模型后下发它，并显示在选择器上', async () => {
    modelGroups.push({
      providerId: 'p',
      providerName: '供应商',
      models: [{ spec: 'p:chosen', label: 'Chosen' }],
    });
    useModelSelection.getState().setOverride('thread-A', 'p:chosen');
    renderAt(paths.app.chat.getHref('thread-A'));

    // 触发按钮显示的是 spec 里的模型名，不是列表里的展示名
    expect(
      screen.getByRole('button', { name: '选择模型' }).textContent,
    ).toContain('chosen');
    await send('你好');

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ modelSpec: 'p:chosen' }),
      ),
    );
  });

  it('清空选择后回到会话绑定的模型', async () => {
    modelGroups.push({
      providerId: 'p',
      providerName: '供应商',
      models: [{ spec: 'p:bound', label: 'Bound' }],
    });
    threadList.threads = [
      { id: 'thread-A', metadata: { model_spec: 'p:bound' } },
    ];
    useModelSelection.getState().setOverride('thread-A', 'p:other');
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(screen.getByRole('button', { name: '选择模型' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /默认/ }),
    );

    expect(useModelSelection.getState().overrideByKey).toEqual({});
    await send('你好');
    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ modelSpec: 'p:bound' }),
      ),
    );
  });

  it('从选择器选一个模型会写进覆盖表', async () => {
    modelGroups.push({
      providerId: 'p',
      providerName: '供应商',
      models: [{ spec: 'p:chosen', label: 'Chosen' }],
    });
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(screen.getByRole('button', { name: '选择模型' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /Chosen/ }),
    );

    expect(useModelSelection.getState().overrideByKey).toEqual({
      'thread-A': 'p:chosen',
    });
  });

  it('本地会话还没有绑定值时，发送后清空选择仍然回到刚下发的模型', async () => {
    // 会话列表里的对象还没有 model_spec（后端刚绑定、列表还没重拉）
    threadList.threads = [
      { id: 'thread-A', agent_id: 'default-chatbot', metadata: {} },
    ];
    useModelSelection.getState().setOverride('thread-A', 'p:chosen');
    renderAt(paths.app.chat.getHref('thread-A'));

    await send('你好');
    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ modelSpec: 'p:chosen' }),
      ),
    );

    // 用户随后清空选择：应当回到刚下发的模型，而不是掉到智能体默认值
    await userEvent.click(screen.getByRole('button', { name: '选择模型' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /默认/ }),
    );
    await send('再说一句');

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ modelSpec: 'p:chosen' }),
      ),
    );
  });

  it('没有会话时显示项目选择器，有会话时不显示', async () => {
    projectList.push({ id: 'p-1', name: '项目一' });
    const { unmount } = renderAt(paths.app.chat.getHref());

    expect(
      await screen.findByRole('button', { name: /选择项目/ }),
    ).toBeTruthy();
    unmount();

    renderAt(paths.app.chat.getHref('thread-A'));
    await waitFor(() => expect(threadList.markViewed).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /选择项目/ })).toBeNull();
  });

  it('确认附件后把结果写进缓存，紧接着发的那条消息才带得上', async () => {
    const confirmed = [
      {
        fileId: 'f-new',
        fileName: 'a.pdf',
        fileType: 'application/pdf',
        fileSize: 10,
        status: 'uploaded',
        requestId: null,
      },
    ];
    attachmentUpload.confirm.mockResolvedValue(confirmed);
    renderAt(paths.app.chat.getHref('thread-A'));
    await openAttachmentDialog();
    await userEvent.click(screen.getByRole('button', { name: '确认附件' }));

    await waitFor(() =>
      expect(cacheThreadAttachments).toHaveBeenCalledWith(
        'thread-A',
        confirmed,
      ),
    );
  });

  it('输入区顶栏只预览还没被用掉的附件', async () => {
    threadAttachments.push(
      {
        fileId: 'f-pending',
        fileName: '待发送.pdf',
        fileSize: 2048,
        requestId: null,
      },
      {
        fileId: 'f-used',
        fileName: '已用掉.pdf',
        fileSize: 2048,
        requestId: 'req-old',
      },
    );
    renderAt(paths.app.chat.getHref('thread-A'));

    expect(await screen.findByText('待发送.pdf')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();
    // 已经被请求用掉的附件不能再出现在预览里，否则用户会以为它还会随这次发送下发
    expect(screen.queryByText('已用掉.pdf')).toBeNull();
  });

  it('发送时带上还没被用掉的附件 id', async () => {
    threadAttachments.push(
      { fileId: 'f-pending', requestId: null },
      { fileId: 'f-used', requestId: 'req-old' },
    );
    renderAt(paths.app.chat.getHref('thread-A'));

    await send('你好');

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentFileIds: ['f-pending'] }),
      ),
    );

    // 请求受理后要刷新附件列表，否则下一次发送会重发已经用掉的 id
    const options = (
      chat.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.at(-1)?.[0];
    options.onAccepted();
    expect(refetchAttachments).toHaveBeenCalled();
  });

  it('没有附件时不下发附件字段', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await send('你好');

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentFileIds: [] }),
      ),
    );
  });

  it('点「+」面板里的「添加附件」打开上传弹窗', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    expect(screen.queryByRole('button', { name: '确认附件' })).toBeNull();
    await openAttachmentDialog();

    expect(screen.getByRole('button', { name: '确认附件' })).toBeTruthy();
  });

  it('有会话时确认附件直接挂到该会话上', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));
    await openAttachmentDialog();
    await userEvent.click(screen.getByRole('button', { name: '确认附件' }));

    await waitFor(() =>
      expect(attachmentUpload.confirm).toHaveBeenCalledWith('thread-A'),
    );
    expect(chat.createThread).not.toHaveBeenCalled();
  });

  it('没有会话时确认附件会先建一条会话', async () => {
    renderAt(paths.app.chat.getHref());
    await openAttachmentDialog();
    await userEvent.click(screen.getByRole('button', { name: '确认附件' }));

    await waitFor(() =>
      expect(attachmentUpload.confirm).toHaveBeenCalledWith('thread-新'),
    );
    expect(chat.createThread).toHaveBeenCalledTimes(1);
  });

  it('历史候选查询拿到的是防抖后的值', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await waitFor(() => expect(historyQueryArgs.length).toBeGreaterThan(0));
    expect(historyQueryArgs).toContain('DEBOUNCED');
  });

  it('建线程期间切走，回到新会话时项目选择已经重置', async () => {
    projectList.push({ id: 'p-1', name: '项目一' });
    let resolveCreate!: (value: unknown) => void;
    chat.createThread.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    renderAt(paths.app.chat.getHref());

    await userEvent.click(
      await screen.findByRole('button', { name: /选择项目/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /项目一/ }),
    );
    await userEvent.type(await screen.findByLabelText('消息输入'), '你好');
    await userEvent.click(screen.getByRole('button', { name: '发送' }));

    // 建线程还没回来就切走：这次发送会被放弃
    await userEvent.click(screen.getByRole('link', { name: '切到 B' }));
    resolveCreate({
      id: 'thread-新',
      agent_id: 'default-chatbot',
      title: '你好',
    });

    // 回到新会话时不该还带着刚才那个项目
    await userEvent.click(screen.getByRole('link', { name: '新建对话' }));
    const trigger = await screen.findByRole('button', { name: /选择项目/ });
    expect(trigger.textContent).toContain('选择项目');
  });

  it('选中项目后建线程带上它的 id', async () => {
    projectList.push({ id: 'p-1', name: '项目一' });
    renderAt(paths.app.chat.getHref());

    await userEvent.click(
      await screen.findByRole('button', { name: /选择项目/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /项目一/ }),
    );
    await send('你好');

    await waitFor(() =>
      expect(chat.createThread).toHaveBeenCalledWith(
        'default-chatbot',
        '你好',
        null,
        'p-1',
      ),
    );
  });

  it('建线程后项目选择回到「不使用项目」', async () => {
    projectList.push({ id: 'p-1', name: '项目一' });
    renderAt(paths.app.chat.getHref());

    await userEvent.click(
      await screen.findByRole('button', { name: /选择项目/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /项目一/ }),
    );
    await send('你好');
    // 建完线程后选择器整个消失：它只服务新会话
    await waitFor(() => expect(threadList.upsert).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('link', { name: '新建对话' }));

    // 下一条新会话不该沿用上一个项目
    const trigger = await screen.findByRole('button', { name: /选择项目/ });
    expect(trigger.textContent).toContain('选择项目');
  });

  it('新建会话时把草稿态选的模型带过去', async () => {
    useModelSelection.getState().setOverride(null, 'p:draft');
    renderAt(paths.app.chat.getHref());

    await send('你好');

    await waitFor(() =>
      expect(chat.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ modelSpec: 'p:draft' }),
      ),
    );
    expect(useModelSelection.getState().overrideByKey).toEqual({
      'thread-新': 'p:draft',
    });
  });

  it('「状态」开独立的状态面板，「文件」开文件面板，两者互不干扰', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(await screen.findByRole('button', { name: '状态' }));
    expect(screen.getByTestId('state-panel-stub')).toBeTruthy();
    // 状态不再是文件面板里的一个 tab
    expect(screen.queryByRole('tablist', { name: '侧边栏内容' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '状态' }));
    expect(screen.queryByTestId('state-panel-stub')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '文件' }));
    expect(
      await screen.findByRole('tablist', { name: '侧边栏内容' }),
    ).toBeTruthy();
    expect(screen.queryByTestId('state-panel-stub')).toBeNull();
  });

  it('文件面板初始只有文件树一个分区', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(await screen.findByRole('button', { name: '文件' }));

    const tabs = within(
      await screen.findByRole('tablist', { name: '侧边栏内容' }),
    ).getAllByRole('tab');
    // 预览、子智能体与调试分区按需追加，不预先占位
    expect(tabs.map((tab) => tab.textContent)).toEqual(['文件']);
  });

  it('文件面板与页头同级，覆盖右缘整高', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(await screen.findByRole('button', { name: '文件' }));

    // 页头：按钮 → 右栏 → 页头本体；面板外壳：AgentPanel 的 aside 外那层 absolute 包装
    const header = screen.getByRole('button', { name: '文件' }).parentElement
      ?.parentElement;
    const panel = document.querySelector(
      'aside[aria-label="侧边栏"]',
    )?.parentElement;
    expect(header).toBeTruthy();
    expect(panel).toBeTruthy();

    // 面板与页头同级（不是被内容行包住的子级），它才覆盖得到页头那一行
    expect(panel?.parentElement).toBe(header?.parentElement);
    // 在页头之后：分栏虚线因此是整列高
    expect(
      header!.compareDocumentPosition(panel!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // 父级正是定义 --file-panel-width 的那个元素：页头让位与拖拽冻结都落在同一个作用域
    expect(
      panel?.parentElement?.style.getPropertyValue('--file-panel-width'),
    ).not.toBe('');
  });

  it('用量环开的是状态面板，不是调试分区', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(
      await screen.findByRole('button', { name: '上下文使用情况' }),
    );

    expect(screen.getByTestId('state-panel-stub')).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: '侧边栏内容' })).toBeNull();
  });

  it('状态面板的刷新按钮拉一次 agent_state', async () => {
    const { fetchAgentState } = await import('@/features/chat');
    renderAt(paths.app.chat.getHref('thread-A'));
    await userEvent.click(await screen.findByRole('button', { name: '状态' }));
    // 打开时已经补拉过一次，这里清掉只验手动刷新
    (fetchAgentState as ReturnType<typeof vi.fn>).mockClear();

    await userEvent.click(screen.getByRole('button', { name: '刷新状态' }));

    expect(fetchAgentState).toHaveBeenCalledWith('thread-A');
  });

  it('容器放得下时状态面板停靠', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1400);
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(await screen.findByRole('button', { name: '状态' }));

    // 1400 - 340 > 800：停靠成窄列
    expect(
      document.querySelector('[data-mode]')?.getAttribute('data-mode'),
    ).toBe('docked');
    vi.restoreAllMocks();
  });

  it('容器不够宽时状态面板浮动', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(await screen.findByRole('button', { name: '状态' }));

    // 1000 - 340 < 800：放不下窄列，改为浮卡
    expect(
      document.querySelector('[data-mode]')?.getAttribute('data-mode'),
    ).toBe('floating');
    vi.restoreAllMocks();
  });

  it('打开文件面板会收起状态面板', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1400);
    renderAt(paths.app.chat.getHref('thread-A'));
    await userEvent.click(await screen.findByRole('button', { name: '状态' }));

    await userEvent.click(screen.getByRole('button', { name: '文件' }));

    // 两块面板不同时占横向空间
    expect(document.querySelector('[data-mode]')).toBeNull();
    vi.restoreAllMocks();
  });

  it('点状态面板里的文件会把文件面板打开', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));
    await userEvent.click(await screen.findByRole('button', { name: '状态' }));

    await userEvent.click(screen.getByRole('button', { name: '状态里的文件' }));

    // 分区只是加进列表：不打开面板的话用户点了没有任何可见变化
    expect(
      await screen.findByRole('tablist', { name: '侧边栏内容' }),
    ).toBeTruthy();
    expect(screen.queryByTestId('state-panel-stub')).toBeNull();
  });

  it('切换预览分区时按各自的路径取内容', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));

    // 从状态面板开出两个预览分区
    await userEvent.click(await screen.findByRole('button', { name: '状态' }));
    await userEvent.click(screen.getByRole('button', { name: '状态里的文件' }));
    expect(await screen.findByTestId('file-preview-stub')).toHaveTextContent(
      '/out/a.md',
    );
    await userEvent.click(screen.getByRole('button', { name: '状态' }));
    await userEvent.click(
      screen.getByRole('button', { name: '状态里的文件 b' }),
    );
    expect(await screen.findByTestId('file-preview-stub')).toHaveTextContent(
      '/out/b.md',
    );

    // 切回第一个分区：内容要跟着分区走，而不是继续显示最后打开的那个文件
    await userEvent.click(screen.getByRole('tab', { name: /a\.md/ }));

    expect(screen.getByTestId('file-preview-stub')).toHaveTextContent(
      '/out/a.md',
    );
  });

  it('状态按钮的高亮与展开态跟着状态面板，而不是文件面板', async () => {
    renderAt(paths.app.chat.getHref('thread-A'));
    const stateButton = await screen.findByRole('button', { name: '状态' });

    expect(stateButton.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(stateButton);

    expect(
      screen
        .getByRole('button', { name: '状态' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    // 文件面板没开，但状态面板开着：这颗按钮不该报告文件面板的状态
    expect(
      screen
        .getByRole('button', { name: '文件' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });
});
