/**
 * 消息反馈端点。
 *
 * 只走契约生成的 SDK。`reason` 只有点踩时会带；后端对重复提交返回错误，调用方据此
 * 提示「已经提交过反馈」，而不是把它当成失败重试。
 */
import { unwrap } from '@/shared/api';
import { submitMessageFeedbackApiChatMessageMessageIdFeedbackPost } from '@/shared/api/generated/sdk.gen';

export type MessageFeedbackRating = 'like' | 'dislike';

/** 提交一条消息的反馈。 */
export async function submitMessageFeedback(
  messageId: string | number,
  rating: MessageFeedbackRating,
  reason?: string | null,
): Promise<void> {
  unwrap(
    await submitMessageFeedbackApiChatMessageMessageIdFeedbackPost({
      path: { message_id: Number(messageId) },
      body: { rating, reason: reason ?? null },
    }),
  );
}
