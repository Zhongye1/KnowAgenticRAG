/**
 * 对话页的纯视图。
 *
 * 页面结构与条件渲染（顶栏、消息区、输入停靠、右侧面板、附件弹窗）都在这里，
 * 数据与动作由容器以分组 props 注入；不读路由、store，也不发起业务动作。
 */
import * as React from 'react';
import { Bug, Folders, ListCollapse, RefreshCw } from 'lucide-react';

import {
  AttachmentUploadDialog,
  GeneratingStatus,
  MessageDebugPanel,
  MessageList,
  PendingInterruptPanel,
  QueueBar,
  StatePanel,
  readAgentStateArtifacts,
  readAgentStateFiles,
  readAgentStateTodos,
  readSubagentRuns,
  readTokenUsage,
  subagentRunTitle,
  type AttachmentUpload,
  type ChatMessage,
  type ChatRuntime,
  type Conversation,
  type ConversationMessage,
  type DebugMessage,
  type PendingInterrupt,
  type QueueRowContext,
  type QueueView,
  type ThreadRequest,
} from '@/features/chat';
import { ChatInputForm } from './chat-input-form';
import type { ChatInputFormProps } from './chat-input-form';
import { ChatSidePanel } from './chat-side-panel';
import type { ChatSidePanelProps } from './chat-side-panel';
import styles from './chat-page.module.css';

export type ChatPageViewProps = {
  header: {
    title: string | null;
    isSuperuser: boolean;
    onToggleDebug: () => void;
    onToggleFiles: () => void;
    onToggleState: () => void;
  };
  conversation: {
    /** 权威历史 + 流式中的消息；两者都为空时显示空态。 */
    messages: ChatMessage[];
    streamingMessages: ConversationMessage[];
    isStreaming: boolean;
    replyStatus: { visible: boolean; text: string };
    replyElapsedSeconds: number;
    resolveKbName: (kbId: string) => string;
    renderArtifacts: (conversation: Conversation) => React.ReactNode;
    chatMainRef: React.RefObject<HTMLDivElement | null>;
  };
  composer: ChatInputFormProps & {
    /** 附件弹窗的确认动作；弹窗开关也在容器，视图只透传。 */
    attachmentUpload: AttachmentUpload;
    onConfirmAttachments: () => Promise<void>;
    queueView: QueueView;
    queuedRequests: ThreadRequest[];
    queueRowContext: QueueRowContext;
    waitingForUserAction: boolean;
    continuing: boolean;
    runQueueAction: (action: Promise<unknown>) => void;
    chat: Pick<
      ChatRuntime,
      'steer' | 'cancelQueued' | 'continueQueue' | 'submitInterrupt'
    >;
    /** 当前线程与智能体；视图用它切换队列栏、审批卡、项目选择器与底部提示。 */
    threadId?: string;
    agentSlug?: string | null;
    pendingInterrupt: PendingInterrupt | null;
    greeting: string;
    currentAgentName: string | undefined;
    /** 无线程时输入框上方的项目选择器；有线程时视图不渲染它。 */
    projectSelector?: React.ReactNode;
  };
  sidePanel: Omit<ChatSidePanelProps, 'children'> & {
    open: boolean;
    maximized: boolean;
    resizing: boolean;
    rowRef: React.RefObject<HTMLDivElement | null>;
    debugMessages: DebugMessage[];
    fetchLangfuseUrl: (runId: string) => Promise<string | null>;
  };
  /**
   * 状态面板：与文件面板独立的第二个表面。
   *
   * 参照里它是一块可停靠（容器放得下时占 340px 窄列）也可浮动（放不下时成为卡片）
   * 的面板，内容是 agent_state 的五个只读段；文件面板是另一个表面。
   */
  statePanel: {
    open: boolean;
    mode: 'docked' | 'floating';
    agentState: unknown;
    refreshing: boolean;
    onRefresh: () => void;
    /** 打开线程文件的预览分区（来自状态分区的产物/文件列表）。 */
    onOpenPreviewFile: (path: string, name: string) => void;
    /** 打开子智能体线程分区。 */
    onOpenSubagent: (run: {
      runId: string | null;
      childThreadId: string;
      name: string;
      status: string | undefined;
    }) => void;
  };
  overlays: {
    attachmentOpen: boolean;
    onAttachmentOpenChange: (open: boolean) => void;
  };
};

export const ChatPageView = ({
  header,
  conversation,
  composer,
  sidePanel,
  statePanel,
  overlays,
}: ChatPageViewProps) => {
  const {
    messages,
    streamingMessages,
    isStreaming,
    replyStatus,
    replyElapsedSeconds,
    resolveKbName,
    renderArtifacts,
    chatMainRef,
  } = conversation;
  const hasContent = messages.length > 0 || streamingMessages.length > 0;
  const {
    threadId,
    agentSlug,
    chat,
    queueView,
    queuedRequests,
    queueRowContext,
    waitingForUserAction,
    continuing,
    runQueueAction,
    pendingInterrupt,
    greeting,
    currentAgentName,
    projectSelector,
    onConfirmAttachments,
    ...inputFormProps
  } = composer;

  return (
    <div className={styles.container}>
      <div
        className={`${styles.chat} ${sidePanel.open ? styles.chatHasPanel : ''} ${
          sidePanel.open && sidePanel.maximized ? styles.chatMaximized : ''
        } ${sidePanel.resizing ? styles.chatResizing : ''}`}
        style={
          {
            // 面板关着时是 0：浮动状态面板的 right 偏移引用它，给成比例宽度会把浮卡推到聊天列中间
            '--file-panel-width': sidePanel.open
              ? typeof sidePanel.width === 'number'
                ? `${sidePanel.width}px`
                : sidePanel.width
              : '0px',
          } as React.CSSProperties
        }
      >
        {/* 顶栏：参照 .chat-header——滚动容器（chatMain）的兄弟，固定不滚 */}
        <div
          className={`${styles.chatHeader} ${
            threadId ? styles.chatHeaderHasThread : ''
          }`}
        >
          <div className={styles.chatHeaderLeft}>
            {header.title && header.title !== '新的对话' ? (
              <div className={styles.conversationTitle}>{header.title}</div>
            ) : null}
          </div>
          <div className={styles.chatHeaderRight}>
            {header.isSuperuser ? (
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navBtnDebug} ${
                  sidePanel.open &&
                  sidePanel.activeSectionKey === 'message-debug'
                    ? styles.navBtnActive
                    : ''
                }`}
                aria-pressed={sidePanel.open}
                onClick={header.onToggleDebug}
              >
                <Bug className="size-3.5" />
                调试
              </button>
            ) : null}
            <button
              type="button"
              className={`${styles.navBtn} ${
                sidePanel.open && sidePanel.activeSectionKey === 'file-tree'
                  ? styles.navBtnActive
                  : ''
              }`}
              aria-expanded={sidePanel.open}
              onClick={header.onToggleFiles}
            >
              <Folders className="size-3.5" aria-hidden />
              文件
            </button>
            <button
              type="button"
              className={`${styles.navBtn} ${
                statePanel.open ? styles.navBtnActive : ''
              }`}
              aria-expanded={statePanel.open}
              aria-controls="agent-state-panel"
              onClick={header.onToggleState}
            >
              <ListCollapse className="size-3.5" aria-hidden />
              状态
            </button>
          </div>
        </div>
        <div
          ref={sidePanel.rowRef}
          className={`${styles.contentRow} ${sidePanel.open ? styles.contentRowHasPanel : ''} ${
            sidePanel.open && sidePanel.maximized
              ? styles.contentRowMaximized
              : ''
          }`}
        >
          <div ref={chatMainRef} className={styles.chatMain}>
            {replyStatus.visible && messages.length > 0 ? (
              <GeneratingStatus
                text={replyStatus.text}
                elapsedSeconds={replyElapsedSeconds}
              />
            ) : null}
            <div className={styles.chatBox}>
              {hasContent ? (
                <MessageList
                  messages={messages}
                  streamingMessages={streamingMessages}
                  isProcessing={isStreaming}
                  resolveKbName={resolveKbName}
                  renderArtifacts={renderArtifacts}
                />
              ) : null}
            </div>

            {/* 输入停靠区：参照 .bottom——sticky 贴底；空态时整体居中（start-screen）。
                审批卡与输入表面同格叠放（参照 .message-input-stage.has-tool-approval）：
                审批时输入表面 opacity:0 + inert，卡片视觉上「变成」输入框。 */}
            <div
              className={`${styles.inputDock} ${
                !hasContent ? styles.inputDockStartScreen : ''
              }`}
            >
              <div className={styles.inputDockInner}>
                {!hasContent ? (
                  /* 空态问候语：参照 .chat-greeting-input（随机标语在输入框上方） */
                  <div className={styles.greeting}>
                    <h1 className={styles.greetingTitle}>{greeting}</h1>
                  </div>
                ) : null}
                {threadId ? (
                  <QueueBar
                    view={queueView}
                    requests={queuedRequests}
                    rowContext={queueRowContext}
                    waitingForUserAction={waitingForUserAction}
                    continuing={continuing}
                    disabled={!agentSlug}
                    onSteer={(requestId) =>
                      runQueueAction(
                        chat.steer({
                          threadId,
                          agentSlug: agentSlug ?? '',
                          requestId,
                        }),
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
                      runQueueAction(
                        chat.continueQueue(threadId, agentSlug ?? ''),
                      )
                    }
                  />
                ) : null}
                <div
                  className={styles.inputStage}
                  data-has-approval={
                    Boolean(pendingInterrupt && threadId) || undefined
                  }
                >
                  {pendingInterrupt && threadId ? (
                    <div className={styles.approvalCard}>
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
                    </div>
                  ) : null}
                </div>
                <ChatInputForm
                  {...inputFormProps}
                  agentSlug={agentSlug ?? null}
                  top={threadId ? null : (projectSelector ?? null)}
                />
                {/* 底部提示：参照 .bottom-actions——在 dock 内、有会话才显示 */}
                {threadId ? (
                  <div className={styles.bottomActions}>
                    <p className={styles.bottomNote}>
                      当前智能体：{currentAgentName ?? '…'}
                      ；请注意辨别内容的可靠性
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* 状态面板：参照 .side-panel--state——停靠时是内容行里的 340px 窄列，
              浮动时是右上角的卡片 */}
          {statePanel.open ? (
            <div
              id="agent-state-panel"
              className={`${styles.statePanel} ${
                statePanel.mode === 'docked'
                  ? styles.statePanelDocked
                  : styles.statePanelFloating
              }`}
              data-mode={statePanel.mode}
            >
              <div className={styles.statePanelHeader}>
                <span className={styles.statePanelTitle}>状态</span>
                <div className={styles.statePanelHeaderActions}>
                  <button
                    type="button"
                    className={styles.stateRefreshButton}
                    title="刷新状态"
                    aria-label="刷新状态"
                    disabled={statePanel.refreshing}
                    onClick={statePanel.onRefresh}
                  >
                    <RefreshCw
                      className={
                        statePanel.refreshing
                          ? styles.stateRefreshSpin
                          : undefined
                      }
                      size={14}
                      aria-hidden
                    />
                  </button>
                </div>
              </div>

              <div className={styles.statePanelBody}>
                <StatePanel
                  tokenUsage={readTokenUsage(statePanel.agentState)}
                  todos={readAgentStateTodos(statePanel.agentState)}
                  files={readAgentStateFiles(statePanel.agentState)}
                  artifacts={readAgentStateArtifacts(statePanel.agentState).map(
                    (path) => ({
                      key: path,
                      path,
                      name: path.split('/').filter(Boolean).pop() || path,
                    }),
                  )}
                  subagentRuns={readSubagentRuns(statePanel.agentState)}
                  onOpenFile={(file) => {
                    statePanel.onOpenPreviewFile(file.path, file.name);
                  }}
                  onOpenSubagent={(run) => {
                    if (!run.child_thread_id) return;
                    statePanel.onOpenSubagent({
                      runId: run.run_id ?? null,
                      childThreadId: run.child_thread_id,
                      name: subagentRunTitle(run),
                      status: run.status,
                    });
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* 文件面板：参照 .side-panel--file——.chat 的直接子级（与页头、内容行并列），
            absolute 覆盖右缘整高；页头靠 padding-right 让位，按钮留在分栏虚线左侧 */}
        <div
          className={`${styles.sidePanel} ${sidePanel.open ? styles.sidePanelVisible : ''} ${
            sidePanel.resizing ? styles.sidePanelNoTransition : ''
          }`}
          style={{ width: sidePanel.width }}
        >
          {sidePanel.open ? (
            <ChatSidePanel {...sidePanel} width="100%">
              <MessageDebugPanel
                messages={sidePanel.debugMessages}
                fetchLangfuseUrl={sidePanel.fetchLangfuseUrl}
              />
            </ChatSidePanel>
          ) : null}
        </div>

        <AttachmentUploadDialog
          open={overlays.attachmentOpen}
          onOpenChange={overlays.onAttachmentOpenChange}
          upload={composer.attachmentUpload}
          onConfirm={onConfirmAttachments}
        />
      </div>
    </div>
  );
};
