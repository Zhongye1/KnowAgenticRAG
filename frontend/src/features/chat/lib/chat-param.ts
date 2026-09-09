/**
 * 从 assistant-ui 消息数组构建 D18 ChatParam（无服务端会话，history 由调用方组装）。
 *
 * - 仅保留有文本内容的 user/assistant 消息，system 不下发；
 * - 最后一条 user 消息即本轮 query_text，其余作为 history；
 * - 附件以 <attachment filename="..."> 块内联在消息文本中，发送前剥离为
 *   ChatParam.attachments 结构化字段（query_text 与 history 均去除标记）；
 * - history 近 N 条（后端默认截 10 轮，客户端先行对齐）。
 */

import type { ChatRequestAttachment } from '../types';

export interface ChatSourcePart {
  type: string;
  text?: unknown;
}

export interface ChatSourceMessage {
  role: string;
  content: readonly ChatSourcePart[];
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequestParam {
  query_text: string;
  history: ChatHistoryMessage[];
  model?: string;
  thinking_level?: string;
  attachments: ChatRequestAttachment[];
}

export interface ChatParamOverrides {
  /** 模型 spec（provider_id:model_id），来自 ModelContext.config.modelName */
  model?: string;
  /** 思考等级，来自 ModelContext.config.reasoningEffort */
  thinkingLevel?: string;
}

export const QUERY_TEXT_MAX_LENGTH = 2000;
export const HISTORY_MESSAGE_MAX_LENGTH = 20000;
export const CHAT_HISTORY_MAX_MESSAGES = 10;
export const MAX_ATTACHMENTS = 4;
export const ATTACHMENT_CONTENT_MAX_LENGTH = 32_000;

const ATTACHMENT_BLOCK_PATTERN = /<attachment filename="([^"]*)">\n?([\s\S]*?)<\/attachment>\n?/g;

const isChatRole = (role: string): role is 'user' | 'assistant' =>
  role === 'user' || role === 'assistant';

export const extractMessageText = (message: ChatSourceMessage): string =>
  message.content
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();

/** 把消息文本中的附件块剥离为结构化附件（非法/超限内容丢弃） */
export const extractAttachments = (
  text: string,
): { text: string; attachments: ChatRequestAttachment[] } => {
  const attachments: ChatRequestAttachment[] = [];
  const stripped = text.replace(
    ATTACHMENT_BLOCK_PATTERN,
    (_match: string, filename: string, content: string) => {
      const trimmed = content.trim();
      if (trimmed && attachments.length < MAX_ATTACHMENTS) {
        attachments.push({
          filename: (filename || '未命名').slice(0, 255),
          content: trimmed.slice(0, ATTACHMENT_CONTENT_MAX_LENGTH),
        });
      }
      return '';
    },
  );
  return { text: stripped.trim(), attachments };
};

export const buildChatParam = (
  messages: readonly ChatSourceMessage[],
  overrides: ChatParamOverrides = {},
): ChatRequestParam | null => {
  const conversation = messages.filter(
    (message) =>
      isChatRole(message.role) && extractMessageText(message).length > 0,
  );

  let lastUserIndex = -1;
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    if (conversation[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex === -1) return null;

  const lastUserRaw = extractMessageText(conversation[lastUserIndex]);
  const { text: lastUserText, attachments } = extractAttachments(lastUserRaw);
  const queryText = lastUserText.slice(0, QUERY_TEXT_MAX_LENGTH);

  const history = conversation
    .slice(0, lastUserIndex)
    .slice(-CHAT_HISTORY_MAX_MESSAGES)
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: extractAttachments(extractMessageText(message)).text.slice(
        0,
        HISTORY_MESSAGE_MAX_LENGTH,
      ),
    }))
    .filter((item) => item.content.length > 0);

  return {
    query_text: queryText,
    history,
    model: overrides.model,
    thinking_level: overrides.thinkingLevel,
    attachments,
  };
};
