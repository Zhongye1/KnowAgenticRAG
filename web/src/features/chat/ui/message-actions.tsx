/**
 * 助手消息的底部工具条。
 *
 * 结构对齐参照的 `RefsComponent`：一行图标（点赞 / 点踩 / 复制 / 时间 / 重新生成）
 * 加右侧对齐的「来源 N」按钮，展开后在下方显示来源详情。
 *
 * 三处与参照的有意差别：
 * - **模型名不显示**：参照读 `response_metadata.model_name`，本仓的消息模型里没有这个字段。
 * - **重新生成只在调用方给了回调时渲染**：本仓还没有重发机制，渲染一个点了没反应的按钮
 *   比不渲染更糟。
 * - **点踩原因用本仓的 Dialog**（参照用 antd Modal），字段与文案（空态、500 字上限）一致。
 */
import * as React from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';

import { copyTextToClipboard } from '@/shared/lib';
import { Button, Input, Modal } from 'antd';
import { useNotifications } from '@/shared/ui/notifications';
import styles from './message-actions.module.css';

import type { ChatMessage } from '../api/agent-api';
import {
  submitMessageFeedback,
  type MessageFeedbackRating,
} from '../api/feedback-api';
import {
  formatChatTime,
  formatDurationLabel,
  messageDurationMs,
} from '../lib/message-time';
import type { ConversationSources } from '../lib/sources';
import { KbChunkGroups } from './kb-chunk-groups';
import { WebSearchResults } from './web-search-results';

/** 点踩原因的字符上限；与参照同值。 */
const DISLIKE_REASON_MAX_LENGTH = 500;

/** 复制成功反馈的保持时长；与参照同值。 */
const COPIED_FEEDBACK_MS = 2000;

type MessageActionsProps = {
  message: ChatMessage;
  sources: ConversationSources;
  /** 重新生成；不传时不渲染该入口。 */
  onRetry?: () => void;
};

export const MessageActions = ({
  message,
  sources,
  onRetry,
}: MessageActionsProps) => {
  const { addNotification } = useNotifications();
  const [rating, setRating] = React.useState<MessageFeedbackRating | null>(
    (message.feedback?.rating as MessageFeedbackRating | undefined) ?? null,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [reasonOpen, setReasonOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [showingDuration, setShowingDuration] = React.useState(false);

  const submitted = rating !== null;
  const finishedAt = formatChatTime(
    message.run_finished_at ?? message.created_at,
  );
  const durationMs = messageDurationMs(
    message.run_started_at,
    message.run_finished_at ?? message.created_at,
  );
  const durationLabel = formatDurationLabel(durationMs);
  const { knowledgeChunks, webSources } = sources;
  const sourceCount = knowledgeChunks.length + webSources.length;

  React.useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const notifyAlreadySubmitted = () =>
    addNotification({
      type: 'info',
      title: '反馈',
      message: '您已经提交过反馈了',
    });

  const sendFeedback = async (
    next: MessageFeedbackRating,
    nextReason?: string,
  ) => {
    if (submitted) {
      notifyAlreadySubmitted();
      return;
    }

    setSubmitting(true);
    try {
      await submitMessageFeedback(message.id, next, nextReason ?? null);
      setRating(next);
      addNotification({
        type: 'success',
        title: '反馈',
        message: '感谢您的反馈！',
      });
    } catch (error) {
      // 重复提交是后端语义，不是失败：如实转达而不是提示「请稍后重试」
      if (error instanceof Error && error.message.includes('already')) {
        setRating(next);
        notifyAlreadySubmitted();
      } else {
        addNotification({
          type: 'error',
          title: '反馈',
          message: '提交反馈失败，请稍后重试',
        });
      }
    } finally {
      setSubmitting(false);
      setReasonOpen(false);
    }
  };

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(message.content);
    if (!ok) {
      addNotification({
        type: 'error',
        title: '复制',
        message: '复制失败，请手动复制',
      });
      return;
    }

    setCopied(true);
    addNotification({
      type: 'success',
      title: '复制',
      message: '文本已复制到剪贴板',
    });
  };

  return (
    <div className={styles.refs}>
      <div className={styles.tags}>
        <button
          type="button"
          className={`${styles.item} ${styles.btn} ${submitting ? styles.disabled : ''}`}
          aria-label="点赞"
          title={rating === 'like' ? '已点赞' : '点赞'}
          disabled={submitting}
          onClick={() => void sendFeedback('like')}
        >
          <ThumbsUp
            className={styles.actionIcon}
            fill={rating === 'like' ? 'currentColor' : 'none'}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className={`${styles.item} ${styles.btn} ${submitting ? styles.disabled : ''}`}
          aria-label="点踩"
          title={rating === 'dislike' ? '已点踩' : '点踩'}
          disabled={submitting}
          onClick={() => {
            if (submitted) {
              notifyAlreadySubmitted();
              return;
            }
            setReasonOpen(true);
          }}
        >
          <ThumbsDown
            className={styles.actionIcon}
            fill={rating === 'dislike' ? 'currentColor' : 'none'}
            aria-hidden
          />
        </button>

        <button
          type="button"
          className={`${styles.item} ${styles.btn}`}
          aria-label={copied ? '已复制' : '复制'}
          title="复制"
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <Check className={styles.actionIcon} aria-hidden />
          ) : (
            <Copy className={styles.actionIcon} aria-hidden />
          )}
        </button>

        {finishedAt ? (
          <span
            className={`${styles.item} ${styles.timeEntry} ${durationMs > 0 ? styles.toggleable : ''}`}
            title={
              durationMs > 0
                ? showingDuration
                  ? '点击显示结束时间'
                  : '点击显示执行耗时'
                : '结束时间'
            }
            onClick={() => {
              if (durationMs > 0) setShowingDuration((current) => !current);
            }}
          >
            {showingDuration && durationLabel ? durationLabel : finishedAt}
          </span>
        ) : null}

        {onRetry ? (
          <button
            type="button"
            className={`${styles.item} ${styles.btn}`}
            aria-label="重新生成"
            title="重新生成"
            onClick={onRetry}
          >
            <RotateCcw className={styles.actionIcon} aria-hidden />
          </button>
        ) : null}

        {sourceCount > 0 ? (
          <>
            <div className={styles.spacer} />
            <button
              type="button"
              className={`${styles.item} ${styles.btn} ${styles.sourcesBtn} ${expanded ? styles.sourcesBtnExpanded : ''}`}
              aria-expanded={expanded}
              title={expanded ? '收起详情' : '查看来源详情'}
              onClick={() => setExpanded((current) => !current)}
            >
              <BookOpen className={styles.actionIcon} aria-hidden />
              <span className={styles.sourcesLabel}>来源 {sourceCount}</span>
              <ChevronDown
                className={`${styles.expandIcon} ${expanded ? styles.expandIconRotated : ''}`}
                aria-hidden
              />
            </button>
          </>
        ) : null}
      </div>

      {expanded ? (
        <div className={styles.sourcesPanel}>
          {knowledgeChunks.length > 0 ? (
            <section className={styles.sourcesSection}>
              <h6 className={styles.sourcesTitle}>
                知识库来源 ({knowledgeChunks.length})
              </h6>
              <KbChunkGroups chunks={knowledgeChunks} showSummary={false} />
            </section>
          ) : null}

          {webSources.length > 0 ? (
            <section className={styles.sourcesSection}>
              <h6 className={styles.sourcesTitle}>
                网络搜索来源 ({webSources.length})
              </h6>
              <WebSearchResults results={webSources} />
            </section>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={reasonOpen}
        onCancel={() => setReasonOpen(false)}
        footer={null}
        title={<div>请告诉我们不满意的原因</div>}
      >
        <Input.TextArea
          rows={4}
          maxLength={DISLIKE_REASON_MAX_LENGTH}
          placeholder="您的反馈将帮助我们改进服务（可选）"
          aria-label="不满意原因"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button
            htmlType="button"
            type="text"
            onClick={() => {
              setReason('');
              setReasonOpen(false);
            }}
          >
            取消
          </Button>
          <Button
            htmlType="button"
            disabled={submitting}
            onClick={() => void sendFeedback('dislike', reason)}
          >
            提交
          </Button>
        </div>
      </Modal>
    </div>
  );
};
