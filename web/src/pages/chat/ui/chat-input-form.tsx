/**
 * 对话页的输入表单。
 *
 * 从 chat-page.tsx 拆出的静态装配，结构与参照的 `AgentInputArea.vue` +
 * `MessageInputComponent.vue` 逐区对应：
 *
 * ```
 * .agent-composer                    本组件 form
 * ├─ .composer-extra-region          顶灰条（空态落项目选择器），在胶囊**外面**
 * └─ .input-box                      胶囊，grid 四区 top / input / options / send
 *    ├─ .top-slot                    待发送图片与附件预览
 *    ├─ .expand-options              左侧：[+ 展开] [审批模式] [智能体]
 *    ├─ .user-input                  编辑区
 *    └─ .send-button-container       右侧：[引导] [用量环] [模型] [发送]
 * ```
 *
 * 发送、引导、附件、图片、模型、审批模式、用量环等动作全部由页面以 props 注入，
 * 本组件不持有对话状态（拖拽高亮状态除外：拖放事件只发生在编辑器那层，需要在这里画到胶囊上）。
 */
import * as React from 'react';
import { ArrowUp, CornerDownRight, FileText, Pause } from 'lucide-react';

import {
  AgentSelector,
  ComposerOptions,
  ContextUsageRing,
  ImageAttachmentPreview,
  MentionEditor,
  ModelSelector,
  ToolApprovalModeSelector,
  formatFileSize,
  type AgentOption,
  type ChatModelGroup,
  type MentionEditorHandle,
  type MentionResourceItem,
  type ThreadAttachment,
  type TokenUsage,
  type ToolApprovalMode,
  type UploadedImage,
} from '@/features/chat';

import styles from './chat-page.module.css';

/** 拖的是不是文件；拖选中的文字不算。 */
const hasTransferFiles = (transfer: DataTransfer | null): boolean =>
  Array.from(transfer?.types ?? []).includes('Files');

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
  /** 「+」面板里的「添加附件」打开上传弹窗。 */
  onOpenAttachments: () => void;
  imagePending: boolean;
  imageFileInputRef: React.RefObject<HTMLInputElement | null>;
  onImageFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** 待发送的图片；顶区预览用。 */
  image: UploadedImage | null;
  onRemoveImage: () => void;
  /** 已绑到会话、还没被用掉的附件；顶区预览用。 */
  pendingAttachments: ThreadAttachment[];
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
  /**
   * 拖入文件到胶囊时回调。图片槽一次只放一张：拖入多个时取第一个，其余由用户重试；
   * 非图片文件由 `validateImageFile` 给出同样的拒绝文案。
   */
  onDropFiles: (files: File[]) => void;
  /** 发送区（右下）。 */
  canSend: boolean;
  isStreaming: boolean;
  /** 审批接管时把整个输入表面置为 inert（参照 .message-input-surface 的 inert）。 */
  inert?: boolean;
  onCancelRun: () => void;
  /** top 区（参照 .composer-extra-region）：胶囊上方的附加行，空态时落项目选择器。 */
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
  image,
  onRemoveImage,
  pendingAttachments,
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
}: ChatInputFormProps) => {
  const editorRef = React.useRef<MentionEditorHandle>(null);
  // 拖拽高亮画在整个胶囊上（参照 .input-box.dragging-files）。
  // dragover 会连续触发，但 setState 传同值会被 React 直接丢弃，不必自己判重
  const [dragging, setDragging] = React.useState(false);

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasTransferFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragging(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasTransferFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    // 只在真正离开胶囊时收掉高亮：子元素之间移动也会触发 dragleave
    if (event.currentTarget.contains(event.relatedTarget as Node | null))
      return;
    setDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasTransferFiles(event.dataTransfer)) return;
    // 拦下浏览器默认行为：不拦会把文件当成导航，整页跳走
    event.preventDefault();
    setDragging(false);

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) onDropFiles(files);
  };

  return (
    <form
      className={styles.composer}
      inert={inert}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {/* 顶灰条：参照 .composer-extra-region——贴在胶囊上缘外侧，不是胶囊里的一行 */}
      {top ? <div className={styles.composerExtra}>{top}</div> : null}

      {/* 大胶囊容器：参照 .input-box 的 grid 四区（top / input / options / send）。
          拖放挂在胶囊上（参照 MessageInputComponent 的 .input-box），不是编辑器上——
          高亮覆盖整块，接受范围就必须是整块 */}
      <div
        className={styles.inputPanel}
        data-dragging={dragging || undefined}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* top 区：参照 .top-slot 里的 .input-top-stack——图片在上、附件卡片在下，
            整块与编辑区留 8px；没有内容时不渲染，否则会白占 8px */}
        {image || pendingAttachments.length > 0 ? (
          <div className={styles.inputTop}>
            {image ? (
              <ImageAttachmentPreview image={image} onRemove={onRemoveImage} />
            ) : null}
            {pendingAttachments.length > 0 ? (
              <div className={styles.attachmentList}>
                {pendingAttachments.map((attachment) => (
                  <div
                    key={attachment.fileId}
                    className={styles.attachmentCard}
                  >
                    <span className={styles.attachmentCardIcon} aria-hidden>
                      <FileText className="size-[18px]" />
                    </span>
                    <div className={styles.attachmentCardBody}>
                      <div
                        className={styles.attachmentCardName}
                        title={attachment.fileName}
                      >
                        {attachment.fileName}
                      </div>
                      <div className={styles.attachmentCardMeta}>
                        {formatFileSize(attachment.fileSize)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 选项区（左下）：参照 .expand-options——[+] 与 .input-actions-left */}
        <div className={styles.inputOptions}>
          <ComposerOptions
            disabled={isStreaming}
            mentionItems={mentionItems}
            imagePending={imagePending}
            onOpenAttachments={onOpenAttachments}
            onUploadImage={() => imageFileInputRef.current?.click()}
            onInsertMention={(item) =>
              editorRef.current?.insertMentionToken(item)
            }
          />
          <div className={styles.inputActionsLeft}>
            <ToolApprovalModeSelector
              value={toolApprovalMode}
              onChange={onChangeToolApprovalMode}
            />
            <AgentSelector
              options={agentOptions}
              selected={agentSlug}
              loading={agentsLoading}
              hasActiveThread={hasActiveThread}
              isCreatingThread={isCreatingThread}
              onSelect={onSelectAgent}
              onBlocked={onAgentBlocked}
            />
          </div>
        </div>

        {/* 编辑区：参照 .user-input（grid-area: input + margin-bottom 0.5rem） */}
        <div className={styles.inputEditor} onPaste={onInputPaste}>
          <MentionEditor
            ref={editorRef}
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            placeholder={inputPlaceholder}
            configItems={mentionItems}
            searchFiles={onSearchFiles}
            displayLabels={mentionLabels}
            ariaLabel="消息输入"
          />
        </div>

        {/* 发送区（右下）：参照 .send-button-container——[引导] [用量环] [模型] 与发送钮 */}
        <div className={styles.inputSend}>
          <div className={styles.inputActionsRight}>
            {/* 运行中把还没发出的输入作为引导插队；文案与悬浮说明同参照 */}
            {canSteerNow ? (
              <button
                type="button"
                className={styles.steerButton}
                title="当前步骤结束后优先执行这条消息"
                onClick={onSteer}
              >
                <CornerDownRight
                  className={styles.steerButtonIcon}
                  aria-hidden
                />
                引导
              </button>
            ) : null}
            {/* 点击环打开右侧面板：参照里它切换的是「状态面板」，且只在有会话时出现
              （没有会话就没有状态可看），本仓对应的是这个面板 */}
            {hasActiveThread ? (
              <ContextUsageRing
                usage={tokenUsage}
                onClick={onContextRingClick}
              />
            ) : null}
            <ModelSelector
              groups={modelGroups}
              selected={modelSelected}
              placeholder="选择模型"
              loading={modelsLoading}
              onSelect={onSelectModel}
            />
          </div>
          {/* 单颗 32px 圆形主色图标钮，运行中切暂停图标并提示「停止回答」
            （参照 .send-button.ant-btn-icon-only）。
            运行中必须保持可点：`canSend` 要求 `!isStreaming`，直接用它会让停止入口
            永远禁用——而这是页面上唯一的 cancelRun 入口（参照的 isSendButtonDisabled
            同样把 isProcessing 排除在外） */}
          <button
            type="submit"
            className={styles.sendButton}
            disabled={!canSend && !isStreaming}
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

      {/* 隐藏的选图入口：由「+」面板的「上传图片」触发 */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="选择图片"
        onChange={onImageFileChange}
      />
    </form>
  );
};
