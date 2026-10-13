/**
 * 一条对话消息：用户消息、系统提示，或带思维链与错误提示的助手消息。
 *
 * 思维链独立折叠，正文走 Markdown，工具调用由列表层单独渲染（`hide-tool-calls`），
 * 避免同一组工具显示两次。用户消息带复制按钮与附件列表；复制按钮的成功反馈是图标
 * 切换成对勾并保持 2 秒，失败只记录到控制台，不改按钮状态。
 */
import * as React from 'react';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  LoaderCircle,
} from 'lucide-react';

import type { ChatMessage } from '../api/agent-api';
import { toImageDataUrl } from '../lib/image-upload';
import { normalizeAttachmentPreviews } from '../lib/message-attachments';
import { extractSources } from '../lib/sources';
import { parseAssistantMessageBody } from '../lib/message-processor';
import { ImageLightbox } from './image-lightbox';
import { MessageActions } from './message-actions';
import { Markdown } from '@/shared/ui/markdown';
import styles from './message-item.module.css';
import { copyTextToClipboard, useIsDarkMode } from '@/shared/lib';

/** 复制成功反馈的保持时长；与参照实现同值。 */
const COPIED_FEEDBACK_MS = 2000;

/** 后端给出的错误码到中文说明；未登记的码原样展示。 */
const ERROR_TYPE_LABELS: Record<string, string> = {
  interrupted: '回答生成已中断',
  unexpect: '生成过程中出现异常',
  content_guard_blocked: '检测到敏感内容，已中断输出',
  agent_error: '智能体获取失败',
};

type MessageItemProps = {
  message: ChatMessage;
  /** 这条消息正在流式输出，思维链此时不可折叠。 */
  isProcessing?: boolean;
  /** `kb_id` → 知识库名；来源里的知识库名要用它，见 `buildToolHeader`。 */
  resolveKbName?: (kbId: string) => string;
};

export const MessageItem = ({
  message,
  isProcessing = false,
  resolveKbName,
}: MessageItemProps) => {
  const isDark = useIsDarkMode();
  const [reasoningExpanded, setReasoningExpanded] = React.useState(false);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const body = React.useMemo(
    () => parseAssistantMessageBody(message),
    [message],
  );
  // 来源按单条消息提取：一条助手消息可能同时带知识库检索与网络搜索的工具结果
  const sources = React.useMemo(
    () => extractSources([message], { resolveKbName }),
    [message, resolveKbName],
  );
  // 还没有正文时就是在思考：这段时间思维链自动展开且不可收起，之后交给用户
  const thinking = isProcessing && !body.content;
  const showReasoning = thinking || reasoningExpanded;

  const markdownTheme = isDark ? 'github-dark' : 'github-light';

  React.useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(message.content);
    if (ok) {
      setCopied(true);
      return;
    }
    // 复制失败不改按钮状态：按钮的对勾就是「已复制」的唯一凭据
    console.error('复制消息失败');
  };

  if (message.type === 'human') {
    const image = message.image_content;
    // 历史消息只存裸 base64，不带 MIME：按内容魔数反推，避免把 jpeg 当 png 渲染
    const imageSrc = image ? toImageDataUrl(image) : null;
    const attachments = normalizeAttachmentPreviews(
      (message.extra_metadata as { attachments?: unknown } | null)?.attachments,
    );

    return (
      <div className={styles.humanRow} data-role="human">
        {imageSrc ? (
          <button
            type="button"
            aria-label="查看大图"
            onClick={() => setPreviewImage(imageSrc)}
          >
            <img
              src={imageSrc}
              alt="用户上传的图片"
              className={styles.humanImage}
            />
          </button>
        ) : null}

        <div className={styles.humanBubble}>
          <p className={styles.humanText}>{message.content}</p>
          <button
            type="button"
            className={styles.copyBtn}
            aria-label={copied ? '已复制' : '复制消息'}
            onClick={() => void handleCopy()}
          >
            {copied ? (
              <Check className={styles.copyIcon} aria-hidden />
            ) : (
              <Copy className={styles.copyIcon} aria-hidden />
            )}
          </button>
        </div>

        {attachments.length > 0 ? (
          <ul className={styles.attachmentList}>
            {attachments.map((attachment) => (
              <li key={attachment.fileId} className={styles.attachmentItem}>
                {/* 参照 .message-attachment-icon：2rem 主色浅底容器 */}
                <span className={styles.attachmentIcon} aria-hidden>
                  <FileText className="size-4" />
                </span>
                <span className={styles.attachmentBody}>
                  <span className={styles.attachmentName}>{attachment.name}</span>
                  <span className={styles.attachmentMeta}>{attachment.meta}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {previewImage ? (
          <ImageLightbox
            src={previewImage}
            alt="用户上传的图片"
            onClose={() => setPreviewImage(null)}
          />
        ) : null}
      </div>
    );
  }

  if (message.type === 'system') {
    return <p className={styles.systemText}>{message.content}</p>;
  }

  const metadata = message.extra_metadata as {
    error_type?: string;
    error_message?: string;
  } | null;
  const errorType = message.error_type ?? metadata?.error_type ?? null;
  // 只要存在 error_type 就提示，正文与提示可以同时出现（半截回答不该看起来像完成）
  const errorText =
    message.error_message ??
    metadata?.error_message ??
    (errorType ? (ERROR_TYPE_LABELS[errorType] ?? errorType) : '');

  return (
    <div className={styles.assistantRow} data-role="assistant">
      {body.reasoningContent ? (
        <div className={styles.reasoningBox}>
          <button
            type="button"
            className={styles.reasoningToggle}
            aria-expanded={showReasoning}
            disabled={thinking}
            onClick={() => setReasoningExpanded((value) => !value)}
          >
            {thinking ? (
              <LoaderCircle
                className={`${styles.reasoningIcon} ${styles.reasoningSpin}`}
                aria-hidden
              />
            ) : (
              <Brain className={styles.reasoningIcon} aria-hidden />
            )}
            <span>{thinking ? 'Thinking...' : '推理过程'}</span>
            {thinking ? null : reasoningExpanded ? (
              <ChevronDown className={styles.reasoningIcon} aria-hidden />
            ) : (
              <ChevronRight className={styles.reasoningIcon} aria-hidden />
            )}
          </button>

          {showReasoning ? (
            <p className={styles.reasoningContent}>{body.reasoningContent}</p>
          ) : null}
        </div>
      ) : null}

      {body.content ? (
        <Markdown
          content={body.content}
          theme={markdownTheme}
          /* 排版走全局 .yk-markdown-preview（styles/markdown-preview.css，对齐参照
             MarkdownPreview.vue）；样式表按类名前缀书写，CSS Modules 会把此处改写 */
          className="yk-markdown-preview"
          codeCopy
        />
      ) : null}

      {errorText ? (
        <p className={styles.errorHint}>{errorText}</p>
      ) : null}

      <MessageActions
        message={message}
        sources={sources}
      />

      {message.isStoppedByUser ? (
        <p className={styles.stoppedHint}>你停止生成了本次回答</p>
      ) : null}
    </div>
  );
};
