/**
 * 附件的临时上传、解析与确认。
 *
 * 响应形状直接复用契约生成的 `TmpAttachmentResponse` / `TmpAttachmentParseResponse` /
 * `TmpAttachmentConfirmResponse` / `AttachmentListResponse`；归一集中在 `lib/attachment-upload.ts`，
 * 在那里仍按不可信数据处理。
 */
import { unwrap } from '@/shared/api';
import {
  confirmTmpThreadAttachmentsApiChatThreadThreadIdAttachmentsConfirmPost,
  listThreadAttachmentsApiChatThreadThreadIdAttachmentsGet,
  parseTmpAttachmentApiChatAttachmentsTmpParsePost,
  uploadTmpAttachmentApiChatAttachmentsTmpPost,
} from '@/shared/api/generated/sdk.gen';
import type {
  AttachmentListResponse,
  TmpAttachmentConfirmResponse,
  TmpAttachmentParseResponse,
  TmpAttachmentResponse,
} from '@/shared/api/generated/types.gen';

import {
  normalizeTmpUpload,
  type AttachmentItem,
  type ThreadAttachment,
} from '../lib/attachment-upload';

/** 上传一个文件到临时区；返回归一后的条目字段。 */
export async function uploadTmpAttachment(
  file: File,
  configuredEngine: unknown,
): Promise<
  Pick<
    AttachmentItem,
    | 'fileName'
    | 'fileType'
    | 'fileSize'
    | 'objectName'
    | 'parseSupported'
    | 'parseMethods'
    | 'selectedParseMethod'
  >
> {
  const response = unwrap<TmpAttachmentResponse>(
    await uploadTmpAttachmentApiChatAttachmentsTmpPost({ body: { file } }),
  );

  return normalizeTmpUpload(response, configuredEngine);
}

/** 解析一个已上传的临时附件；返回解析结果的对象名。 */
export async function parseTmpAttachment(input: {
  objectName: string;
  parseMethod: string;
}): Promise<string> {
  const response = unwrap<TmpAttachmentParseResponse>(
    await parseTmpAttachmentApiChatAttachmentsTmpParsePost({
      body: { object_name: input.objectName, parse_method: input.parseMethod },
    }),
  );
  const parsed = (response as { parsed_object_name?: unknown } | null)
    ?.parsed_object_name;
  // 解析结果没有对象名等于没解析成功，不能把它当成可确认的解析态
  if (typeof parsed !== 'string' || !parsed) {
    throw new Error('解析结果缺少对象名');
  }

  return parsed;
}

/** 把可确认的条目绑到会话上；返回后端确认后的附件。 */
export async function confirmTmpThreadAttachments(input: {
  threadId: string;
  attachments: Array<{
    file_type: string;
    object_name: string;
    parsed_object_name: string | null;
  }>;
}): Promise<ThreadAttachment[]> {
  return normalizeThreadAttachments(
    unwrap<TmpAttachmentConfirmResponse>(
      await confirmTmpThreadAttachmentsApiChatThreadThreadIdAttachmentsConfirmPost(
        {
          path: { thread_id: input.threadId },
          body: { attachments: input.attachments },
        },
      ),
    ),
  );
}

/** 会话里已确认的附件；字段按不可信数据处理。 */
export function normalizeThreadAttachments(raw: unknown): ThreadAttachment[] {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const attachments: ThreadAttachment[] = [];

  for (const entry of Array.isArray(source.attachments)
    ? source.attachments
    : []) {
    if (typeof entry !== 'object' || entry === null) continue;

    const attachment = entry as Record<string, unknown>;
    const fileId =
      typeof attachment.file_id === 'string' ? attachment.file_id.trim() : '';
    if (!fileId) continue;

    attachments.push({
      fileId,
      fileName:
        typeof attachment.file_name === 'string'
          ? attachment.file_name.trim()
          : '',
      fileType:
        typeof attachment.file_type === 'string'
          ? attachment.file_type.trim()
          : '',
      fileSize:
        typeof attachment.file_size === 'number' &&
        Number.isFinite(attachment.file_size)
          ? attachment.file_size
          : 0,
      status:
        typeof attachment.status === 'string' ? attachment.status : 'uploaded',
      requestId:
        typeof attachment.request_id === 'string' && attachment.request_id
          ? attachment.request_id
          : null,
    });
  }

  return attachments;
}

/** 列出会话里已确认的附件。 */
export async function listThreadAttachments(
  threadId: string,
): Promise<ThreadAttachment[]> {
  return normalizeThreadAttachments(
    unwrap<AttachmentListResponse>(
      await listThreadAttachmentsApiChatThreadThreadIdAttachmentsGet({
        path: { thread_id: threadId },
      }),
    ),
  );
}
