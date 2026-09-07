/**
 * 从 assistant-ui 消息数组构建 D18 ChatParam（无服务端会话，history 由调用方组装）。
 *
 * - 仅保留有文本内容的 user/assistant 消息，system 不下发；
 * - 最后一条 user 消息即本轮 query_text，其余作为 history；
 * - history 近 N 条（后端默认截 10 轮，客户端先行对齐）。
 */

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
}

export const QUERY_TEXT_MAX_LENGTH = 2000;
export const HISTORY_MESSAGE_MAX_LENGTH = 20000;
export const CHAT_HISTORY_MAX_MESSAGES = 10;

const isChatRole = (role: string): role is 'user' | 'assistant' =>
  role === 'user' || role === 'assistant';

export const extractMessageText = (message: ChatSourceMessage): string =>
  message.content
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();

export const buildChatParam = (
  messages: readonly ChatSourceMessage[],
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

  const queryText = extractMessageText(conversation[lastUserIndex]).slice(
    0,
    QUERY_TEXT_MAX_LENGTH,
  );

  const history = conversation
    .slice(0, lastUserIndex)
    .slice(-CHAT_HISTORY_MAX_MESSAGES)
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: extractMessageText(message).slice(
        0,
        HISTORY_MESSAGE_MAX_LENGTH,
      ),
    }));

  return { query_text: queryText, history };
};
