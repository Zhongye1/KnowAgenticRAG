import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { paths } from '@/shared/config';

const { chat, runtime, notifications, agentRunApi, chatOptions, session } =
  vi.hoisted(() => ({
    session: { isSuperuser: true },
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
      pendingInterrupt: null as unknown,
      onGoingConv: { msgChunks: {} },
    },
    notifications: { addNotification: vi.fn() },
    agentRunApi: {
      getDefaultAgent: vi
        .fn()
        .mockResolvedValue({ agent: { slug: 'default-chatbot' } }),
      uploadImage: vi.fn(),
    },
    chatOptions: { current: null as null | Record<string, unknown> },
  }));

vi.mock('@/entities/session', () => ({
  useIsSuperuser: () => session.isSuperuser,
}));

vi.mock('@/features/chat', async () => {
  // 草稿与图片只依赖 localStorage 与 DOM，用真实实现；网络调用由 agentRunApi 桩替代
  const draft = await vi.importActual<
    typeof import('@/features/chat/lib/thread-draft')
  >('@/features/chat/lib/thread-draft');
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
  return {
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
    findClipboardImage: imageUpload.findClipboardImage,
    normalizeUploadedImage: imageUpload.normalizeUploadedImage,
    validateImageFile: imageUpload.validateImageFile,
    ImageAttachmentPreview: preview.ImageAttachmentPreview,
    agentRunApi,
    describeQueueRow: () => ({ canSteer: true, canCancel: true }),
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
    ConversationList: () => null,
    useStreamingMessages: () => [],
    useChatRuntime: (options: Record<string, unknown>) => {
      chatOptions.current = options;
      return chat;
    },
    useThreadRuntime: () => runtime,
  };
});

vi.mock('@/shared/ui/notifications', () => ({
  useNotifications: () => notifications,
}));

const { threadList } = vi.hoisted(() => ({
  threadList: {
    agentSlug: 'default-chatbot',
    agentToolApprovalMode: null as string | null,
    threads: [] as Array<Record<string, unknown>>,
    ensureAgentSlug: vi.fn(),
    upsert: vi.fn(),
    setToolApprovalMode: vi.fn(),
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

/**
 * 复刻真实路由形状：`/agent` 与 `/agent/:threadId` 共用同一个组件实例。
 * 同时套上 `StrictMode`，与 `pnpm dev` 的挂载行为一致。
 */
function renderAt(initialPath: string) {
  return render(
    <React.StrictMode>
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
    threadList.agentToolApprovalMode = null;
    threadList.threads = [];
    agentRunApi.uploadImage.mockReset();
  });

  it('超管能打开消息调试面板，面板拿到当前线程的消息', async () => {
    session.isSuperuser = true;
    runtime.messages = [
      { id: 'm-1', type: 'human', content: '你好' },
      { id: 'm-2', type: 'ai', content: '你好呀' },
    ];
    renderAt(paths.app.chat.getHref('thread-A'));

    await userEvent.click(
      await screen.findByRole('button', { name: /消息调试/ }),
    );

    expect(await screen.findByTestId('message-debug-panel')).toHaveTextContent(
      '2 条',
    );
    await userEvent.click(screen.getByRole('button', { name: /关闭调试/ }));
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
    expect(screen.getByLabelText<HTMLInputElement>('消息输入').value).toBe(
      '你好',
    );
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
      expect(screen.getByLabelText<HTMLInputElement>('消息输入').value).toBe(
        '',
      ),
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
      expect(screen.getByLabelText<HTMLInputElement>('消息输入').value).toBe(
        '还没发出去',
      ),
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

    expect(screen.getByLabelText<HTMLInputElement>('消息输入').value).toBe(
      '刷新前的草稿',
    );
  });

  it('发送成功后不留草稿，回到新建对话不会还原已发送的文本', async () => {
    renderAt(paths.app.chat.getHref());

    await send('你好');
    await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('link', { name: '新建对话' }));

    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('消息输入').value).toBe(
        '',
      ),
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
      await screen.findByRole('menuitemradio', { name: '完全信任' }),
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
      await screen.findByRole('menuitemradio', { name: '完全信任' }),
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
      await screen.findByRole('menuitemradio', { name: '完全信任' }),
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

  it('线程 state 里的用量快照渲染成用量卡片', async () => {
    runtime.agentState = {
      token_usage: {
        llm_input_tokens: 2048,
        context_window: 4096,
        llm_messages_tokens: 1024,
      },
    };
    renderAt(paths.app.chat.getHref('thread-A'));

    expect(await screen.findByTestId('token-usage')).toBeTruthy();
    expect(screen.getByTestId('token-usage').textContent).toContain(
      '上下文占用 50%',
    );
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
});
