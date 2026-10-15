/**
 * 提及文件搜索端点。
 *
 * 未创建 thread 时只搜用户工作区；已有 thread 时可搜当前对话文件。契约里的
 * `source` 用来区分两者。
 */
import { unwrap } from '@/shared/api';
import { searchMentionFilesApiMentionSearchGet } from '@/shared/api/generated/sdk.gen';
import type { MentionFileItem } from '@/shared/api/generated/types.gen';

export type { MentionFileItem };

/** 按关键词模糊搜索可提及的文件。 */
export async function searchMentionFiles(
  payload: { threadId?: string; query: string },
  signal?: AbortSignal,
): Promise<MentionFileItem[]> {
  return unwrap<MentionFileItem[]>(
    await searchMentionFilesApiMentionSearchGet({
      query: {
        ...(payload.threadId ? { thread_id: payload.threadId } : {}),
        query: payload.query,
      },
      signal,
    }),
  );
}
