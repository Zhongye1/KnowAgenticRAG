/**
 * 反馈列表弹窗。
 *
 * 全部 / 点赞 / 点踩 三档、卡片列表、长正文的展开收起与空态。
 * 反馈端点不接受参数，类型筛选在客户端做。
 */
import * as React from 'react';
import { Clock, ThumbsDown, ThumbsUp } from 'lucide-react';

import type { FeedbackItem } from '../api/dashboard-api';
import { formatFullDateTime } from '../lib/dashboard-format';
import {
  FEEDBACK_FILTER_OPTIONS,
  filterFeedbacks,
  feedbackRatingLabel,
  shouldShowMessageExpandButton,
  type FeedbackRatingFilter,
} from '../lib/tool-feedback-view';
import { useFeedbackList } from '../model/dashboard-queries';
import { PanelBody } from './panel-card';
import { ToggleGroup } from './toggle-group';
import { Button, Modal } from 'antd';
import { Empty } from '@/shared/ui/empty';

const FeedbackCard = ({ item }: { item: FeedbackItem }) => {
  const [expandedMessage, setExpandedMessage] = React.useState(false);
  const isLike = item.rating === 'like';

  return (
    <article
      data-testid="feedback-card"
      className="flex flex-col overflow-hidden rounded-large border border-color-border-1 bg-color-bg-1"
    >
      <header className="flex items-center justify-between gap-2 border-b border-color-border-1 bg-color-bg-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-color-text-1">
            {item.username || '未知用户'}
          </span>
        </div>
        <span
          className={
            isLike
              ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-success-1 px-2 py-0.5 text-[11px] font-medium text-success-7'
              : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-1 px-2 py-0.5 text-[11px] font-medium text-danger-7'
          }
        >
          {isLike ? (
            <ThumbsUp className="size-3" aria-hidden />
          ) : (
            <ThumbsDown className="size-3" aria-hidden />
          )}
          {feedbackRatingLabel(item.rating)}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        <div className="text-xs text-color-text-3">
          <span className="font-medium text-color-text-2">智能体：</span>
          {item.agent_id}
        </div>

        {item.conversation_title ? (
          <div className="text-xs text-color-text-3">
            <span className="font-medium text-color-text-2">对话：</span>
            {item.conversation_title}
          </div>
        ) : null}

        {item.message_content ? (
          <div>
            <p
              className={
                expandedMessage
                  ? 'rounded-medium bg-color-bg-2 p-2.5 text-[13px] leading-relaxed break-words text-color-text-2'
                  : 'line-clamp-8 rounded-medium bg-color-bg-2 p-2.5 text-[13px] leading-relaxed break-words text-color-text-2'
              }
            >
              {item.message_content}
            </p>
            {shouldShowMessageExpandButton(item.message_content) ? (
              <Button
                htmlType="button"
                variant="link"
                size="small"
                className="mt-1"
                onClick={() => setExpandedMessage((value) => !value)}
              >
                {expandedMessage ? '收起' : '展开全部'}
              </Button>
            ) : null}
          </div>
        ) : null}

        {item.reason ? (
          <div>
            <span className="text-[11px] font-medium text-color-text-3">
              反馈原因：
            </span>
            <p className="mt-1 rounded-medium border-l-2 border-warning-5 bg-warning-1 p-2.5 text-[13px] leading-relaxed break-words text-color-text-2">
              {item.reason}
            </p>
          </div>
        ) : null}
      </div>

      <footer className="flex items-center gap-1 border-t border-color-border-1 bg-color-bg-2 px-4 py-2 text-[11px] text-color-text-3">
        <Clock className="size-3" aria-hidden />
        <span>{formatFullDateTime(item.created_at)}</span>
      </footer>
    </article>
  );
};

export type FeedbackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const FeedbackDialog = ({ open, onOpenChange }: FeedbackDialogProps) => {
  const [rating, setRating] = React.useState<FeedbackRatingFilter>('all');
  const feedbacks = useFeedbackList();
  const visible = filterFeedbacks(feedbacks.data ?? [], rating);

  return (
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      width={1100}
      styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
      title={
        <div>
          <div>用户反馈详情</div>
          <div className="text-xs font-normal text-color-text-3">
            按类型查看用户对智能体回复的评价与原因。
          </div>
        </div>
      }
    >
      <ToggleGroup
        label="反馈类型"
        value={rating}
        options={FEEDBACK_FILTER_OPTIONS}
        onChange={setRating}
        testId="feedback-rating-filter"
      />

      <PanelBody
        loading={feedbacks.isPending}
        error={feedbacks.isError}
        onRetry={() => void feedbacks.refetch()}
        errorText="反馈列表加载失败。"
        height={200}
        testId="feedback-list"
      >
        {visible.length === 0 ? (
          <Empty
            description={
              (feedbacks.data ?? []).length === 0
                ? '暂无反馈数据。用户在会话里点赞或点踩后会出现在这里。'
                : '当前类型下没有反馈，可切换类型查看。'
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => (
              <FeedbackCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </PanelBody>
    </Modal>
  );
};
