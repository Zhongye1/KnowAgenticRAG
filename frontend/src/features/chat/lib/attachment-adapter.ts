import type { AttachmentAdapter, CompleteAttachment, PendingAttachment } from '@assistant-ui/react';

/**
 * 随问文本附件 adapter：仅接受轻量文本文件，发送时以
 * `<attachment filename>` 块内联进消息文本（chat-param 构建请求时剥离为
 * ChatParam.attachments）。大小上限与后端 ChatAttachment.content 对齐。
 * 大文件（PDF 等）应走知识库摄取链路，而不是随问附件。
 */

export const CHAT_ATTACHMENT_MAX_BYTES = 32_000;

export const CHAT_ATTACHMENT_ACCEPT =
  '.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.log,.yml,.yaml,.xml';

export class ChatTextAttachmentAdapter implements AttachmentAdapter {
  accept = CHAT_ATTACHMENT_ACCEPT;

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
      throw new Error(
        `附件 ${file.name} 超过 32KB 限制；大文件请上传到知识库后再提问`,
      );
    }
    return {
      id: crypto.randomUUID(),
      type: 'document',
      name: file.name,
      file,
      status: { type: 'requires-action', reason: 'composer-send' },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const text = await attachment.file.text();
    return {
      id: attachment.id,
      type: 'document',
      name: attachment.name,
      content: [
        {
          type: 'text',
          text: `<attachment filename="${attachment.name}">\n${text.trim()}\n</attachment>`,
        },
      ],
      status: { type: 'complete' },
    };
  }

  async remove(): Promise<void> {
    // 无需清理：文件对象由 runtime 生命周期管理
  }
}

export const chatAttachmentAdapter = new ChatTextAttachmentAdapter();
