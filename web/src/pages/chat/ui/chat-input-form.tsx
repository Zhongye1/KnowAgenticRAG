/**
 * 对话页的输入表单。
 *
 * 从 chat-page.tsx 拆出的静态装配：grid 四区（选项 / 编辑 / 发送）对应参照实现的
 * `.input-box` 内部结构。发送、引导、附件、图片、模型、审批模式、用量环等动作全部
 * 由页面以 props 注入，本组件不持有对话状态。
 */
import * as React from 'react';
import { ArrowUp, CornerDownRight, Pause } from 'lucide-react';

import {
  AgentSelector,
  Button,
  ContextUsageRing,
  MentionEditor,
  ModelSelector,
  Spinner,
  ToolApprovalModeSelector,
  type AgentOption,
  type ChatModelGroup,
  type TokenUsage,
  type MentionResourceItem,
  type ToolApprovalMode,
} from '@/features/chat';

import styles from './chat-page.module.css';

export type ChatInputFormProps = {
  agentOptions: AgentOption[];
  agentSlug: string | null;
  agentsLoading: boolean;
  hasActiveThread: boolean;
  isCreatingThread: boolean;
  onSelectAgent: (slug: string) => void;
  onAgentBlocked: (reason: string) => void;
  /** 审批模式当前值；回退链在页面解析，永远有值。 */
  toolApprovalMode: ToolApprovalMode;
  onChangeToolApprovalMode: (mode: ToolApprovalMode) => void;
  tokenUsage: TokenUsage | null;
  /** 点击用量环打开右侧面板。 */
  onContextRingClick: () => void;
  /** 模型选择器：当前规格（可为空串）与选择回调由页面给。 */
  modelSelected: string;
  modelGroups: ChatModelGroup[];
  modelsLoading: boolean;
  onSelectModel: (spec: string) => void;
  /** 运行中把还没发出的输入作为引导插队；false 时不渲染入口。 */
  canSteerNow: boolean;
  onSteer: () => void;
  onOpenAttachments: () => void;
  imagePending: boolean;
  imageFileInputRef: React.RefObject<HTMLInputElement | null>;
  onImageFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** 编辑区（中）。 */
  input: string;
  onInputPaste: (event: React.ClipboardEvent<HTMLElement>) => void;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  inputPlaceholder: string;
  mentionItems: MentionResourceItem[];
  mentionLabels: Record<string, string>;
  /** 文件提及的远程搜索，由页面按当前线程注入。 */
  onSearchFiles: (query: string) => Promise<MentionResourceItem[]>;
  onDropFiles: (files: File[]) => void;
  /** 发送区（右下）。 */
  canSend: boolean;
  isStreaming: boolean;
  /** 审批接管时把整个输入表面置为 inert（参照 .message-input-surface 的 inert）。 */
  inert?: boolean;
  onCancelRun: () => void;
  /** top 区（参照 .composer-extra-region）：输入框上方的附加行，空态时落项目选择器。 */
  top?: React.ReactNode;
};

export const ChatInputForm = ({
  agentOptions,
  agentSlug,
  agentsLoading,
  hasActiveThread,
  isCreatingThread,
  onSelectAgent,
  onAgentBlocked,
  toolApprovalMode,
  onChangeToolApprovalMode,
  tokenUsage,
  onContextRingClick,
  modelSelected,
  modelGroups,
  modelsLoading,
  onSelectModel,
  canSteerNow,
  onSteer,
  onOpenAttachments,
  imagePending,
  imageFileInputRef,
  onImageFileChange,
  input,
  onInputPaste,
  onInputChange,
  onSubmit,
  inputPlaceholder,
  mentionItems,
  mentionLabels,
  onSearchFiles,
  onDropFiles,
  canSend,
  isStreaming,
  inert = false,
  onCancelRun,
  top,
}: ChatInputFormProps) => (
  <form
    inert={inert}
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    {/* 大胶囊容器：参照 .input-box 的 grid 四区（top / input / options / send） */}
    <div className={styles.inputPanel}>
    {/* top 区：参照 .composer-extra-region——输入框上方的附加行 */}
    {top ? <div className={styles.inputTop}>{top}</div> : null}
    {/* 选项区（左下）：参照 .expand-options + .input-actions */}
    <div className={styles.inputOptions}>
      <AgentSelector
        options={agentOptions}
        selected={agentSlug}
        loading={agentsLoading}
        hasActiveThread={hasActiveThread}
        isCreatingThread={isCreatingThread}
        onSelect={onSelectAgent}
        onBlocked={onAgentBlocked}
      />
      <ToolApprovalModeSelector
        value={toolApprovalMode}
        onChange={onChangeToolApprovalMode}
      />
      {/* 点击环打开右侧面板：参照里它切换的是「状态面板」，本仓对应的是这个面板 */}
      <ContextUsageRing usage={tokenUsage} onClick={onContextRingClick} />
      <ModelSelector
        groups={modelGroups}
        selected={modelSelected}
        placeholder="选择模型"
        loading={modelsLoading}
        onSelect={onSelectModel}
      />
      {/* 运行中把还没发出的输入作为引导插队；文案与悬浮说明同参照 */}
      {canSteerNow ? (
        <Button
          variant="outline"
          title="当前步骤结束后优先执行这条消息"
          onClick={onSteer}
        >
          <CornerDownRight className="size-3.5" aria-hidden />
          引导
        </Button>
      ) : null}
      <Button variant="outline" onClick={onOpenAttachments}>
        附件
      </Button>
      <Button
        variant="outline"
        disabled={isStreaming}
        onClick={() => imageFileInputRef.current?.click()}
      >
        {imagePending ? <Spinner aria-hidden className="size-4" /> : null}
        图片
      </Button>
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="选择图片"
        onChange={onImageFileChange}
      />
    </div>
    {/* 编辑区：参照 .user-input（grid-area: input + margin-bottom 0.5rem） */}
    <div className={styles.inputEditor} onPaste={onInputPaste}>
      <MentionEditor
        value={input}
        onChange={onInputChange}
        onSubmit={onSubmit}
        placeholder={inputPlaceholder}
        configItems={mentionItems}
        searchFiles={onSearchFiles}
        displayLabels={mentionLabels}
        /* 图片槽一次只放一张：拖入多个时取第一个，其余由用户重试；
           非图片文件由 validateImageFile 给出同样的拒绝文案 */
        onDropFiles={onDropFiles}
        ariaLabel="消息输入"
      />
    </div>
    {/* 发送区（右下）：参照 .send-button-container——单颗 32px 圆形主色图标钮，
        运行中切暂停图标并提示「停止回答」（参照 .send-button.ant-btn-icon-only） */}
    <div className={styles.inputSend}>
      <button        type="submit"
        className={styles.sendButton}
        disabled={!canSend}
        aria-label={isStreaming ? '停止回答' : '发送'}
        title={isStreaming ? '停止回答' : undefined}
        onClick={(event) => {
          if (!isStreaming) return;
          event.preventDefault();
          onCancelRun();
        }}
      >
        {isStreaming ? (
          <Pause className={styles.sendButtonIcon} aria-hidden />
        ) : (
          <ArrowUp className={styles.sendButtonIcon} aria-hidden />
        )}
      </button>
    </div>
    </div>
  </form>
);
