/**
 * 历史消息到渲染用的会话分组。
 *
 * 逐条对照上游 `utils/messageProcessor.js` 的 `convertServerHistoryToMessages`
 * 与 `parseAssistantMessageBody`：工具消息已经被后端嵌进 AI 消息的
 * `tool_calls[].tool_call_result`，独立的 `tool` 消息与提问恢复占位消息都要丢掉。
 */
import type { ChatMessage } from '../api/agent-api';

/** 渲染期追加标记的消息：`isLast` 标出这一轮最后的助手消息，不属于接口字段。 */
export type ConversationMessage = ChatMessage & { isLast?: boolean };

/** 一轮对话：一条用户消息加上它之后的全部助手消息。 */
export type Conversation = {
  messages: ConversationMessage[];
  /** `streaming` 只用于页面追加的那一轮，永不折叠。 */
  status: 'loading' | 'finished' | 'streaming';
};

/** 正文与思维链的拆分结果。 */
export type AssistantMessageBody = {
  content: string;
  reasoningContent: string;
};

/**
 * 拆出正文与思维链。
 *
 * 优先用 `additional_kwargs.reasoning_content`（后端已分离的思维链）；
 * 没有时从正文里的 `<think>` 标签提取，兼容内联思考的模型输出。
 */
export function parseAssistantMessageBody(
  message: ChatMessage | null | undefined,
): AssistantMessageBody {
  let content = typeof message?.content === 'string' ? message.content.trim() : '';
  const additional = (
    message?.extra_metadata as { additional_kwargs?: { reasoning_content?: string } } | null
  )?.additional_kwargs;
  let reasoningContent = additional?.reasoning_content || '';

  if (!reasoningContent && content) {
    const thinkMatch = content.match(/<think>(.*?)<\/think>|<think>(.*?)$/s);
    if (thinkMatch) {
      reasoningContent = (thinkMatch[1] || thinkMatch[2] || '').trim();
      content = content.replace(thinkMatch[0], '').trim();
    }
  }

  return { content, reasoningContent };
}

/** 其余角色（如独立的 `tool` 消息）不进入任何一轮：工具结果已经嵌在 AI 消息里。 */
function isResumePlaceholder(message: ChatMessage): boolean {
  const metadata = message.extra_metadata as { source?: string } | null;
  return message.type === 'human' && metadata?.source === 'ask_user_question_resume';
}

/** 把扁平历史切成「用户消息 + 其后助手消息」的若干轮，并标出每轮最后的助手消息。 */
export function toConversations(history: ChatMessage[] | null | undefined): Conversation[] {
  const conversations: Conversation[] = [];
  let current: Conversation | null = null;

  // 历史对象是运行时的权威状态，标记时浅拷贝，避免把渲染期信息写回共享数据
  const markLast = (conversation: Conversation) => {
    for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
      if (conversation.messages[index]?.type === 'ai') {
        conversation.messages[index] = {
          ...conversation.messages[index]!,
          isLast: true,
        };
        conversation.status = 'finished';
        return;
      }
    }
  };

  for (const item of history ?? []) {
    if (isResumePlaceholder(item)) continue;

    if (item.type === 'human') {
      if (current) markLast(current);
      current = { messages: [item], status: 'loading' };
      conversations.push(current);
      continue;
    }

    if (item.type === 'ai' && current) {
      current.messages.push(item);
    }
  }

  if (current && current.messages.length > 0) markLast(current);
  return conversations;
}

/**
 * 工具结果分片：`type` 为 `tool`，`id` 是 ToolMessage 自己的 id，
 * 真正标识调用的是 `tool_call_id`（上传的 output 里带着）。
 */
export type StreamedToolResult = {
  type?: string;
  id?: string;
  tool_call_id?: string;
  content?: unknown;
  output?: unknown;
};

/** 流式分片里与本文件相关的最小投影。 */
export type StreamedChunk = {
  /** 消息角色；文本分片是 `AIMessageChunk`，init 下发的人类消息是 `human`。 */
  type?: string;
  content?: string;
  /** 用户消息携带的图片（裸 base64）；只有人类消息有。 */
  image_content?: string;
  reasoning_content?: string;
  additional_kwargs?: { reasoning_content?: string };
  tool_call_chunks?: Array<{
    index?: number;
    id?: string;
    name?: string;
    args?: string;
  }>;
};

/**
 * 把一条流式消息的分片拼成可渲染的消息。
 *
 * 工具调用按 `index` 归并（同一次回复可能并行调用多个工具），名称与 id 取首次出现的值，
 * 参数是逐段拼接的字符串；与上游 `mergeMessageChunk` / `_mergeToolCalls` 同规则。
 */
export function mergeStreamedMessage(
  id: string,
  chunks: StreamedChunk[],
): ConversationMessage {
  let content = '';
  let reasoningContent = '';
  const toolCalls: NonNullable<ChatMessage['tool_calls']> = [];

  for (const chunk of chunks) {
    if (chunk.content) content += chunk.content;
    const reasoning =
      chunk.reasoning_content ?? chunk.additional_kwargs?.reasoning_content;
    if (reasoning) reasoningContent += reasoning;

    for (const toolCallChunk of chunk.tool_call_chunks ?? []) {
      const index = toolCallChunk.index ?? toolCalls.length;
      let existing = toolCalls.find((item) => item.index === index);
      if (!existing) {
        existing = { index, id: toolCallChunk.id, function: { arguments: '' } };
        toolCalls.push(existing);
      }
      if (toolCallChunk.name && !existing.function?.name) {
        existing.function = { ...existing.function, name: toolCallChunk.name };
      }
      if (toolCallChunk.id && !existing.id) existing.id = toolCallChunk.id;
      if (toolCallChunk.args) {
        existing.function = {
          ...existing.function,
          arguments: `${existing.function?.arguments ?? ''}${toolCallChunk.args}`,
        };
      }
    }
  }

  // 角色取首分片：init 会先下发用户自己那条消息，把它当 AI 消息会走 Markdown 与思维链解析
  const firstType = chunks[0]?.type;
  const type = !firstType || firstType === 'AIMessageChunk' ? 'ai' : firstType;
  const message: ChatMessage = { id, type, content };
  if (reasoningContent) {
    message.extra_metadata = {
      additional_kwargs: { reasoning_content: reasoningContent },
    };
  }
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }
  // 人类消息的图片取首分片：本地占位与 init 下发的权威消息带的是同一张图
  const firstChunk = chunks[0];
  if (firstChunk?.image_content) {
    message.image_content = firstChunk.image_content;
  }
  return message;
}

/**
 * 把一批流式分片拆成「AI 消息」与「工具结果」。
 *
 * 工具结果不走 messages 流（`stream-handler` 把它标成 `type: 'tool'`），
 * 因此这里按 tool_call_id 收成一张表，再由 `attachToolResults` 并回发起它的调用。
 */
/** 分片拼出的这条消息是否只有思维链。 */
function hasReasoning(message: ConversationMessage): boolean {
  return Boolean(
    (
      message.extra_metadata as {
        additional_kwargs?: { reasoning_content?: string };
      } | null
    )?.additional_kwargs?.reasoning_content,
  );
}

export function splitStreamedChunks(
  entries: Array<[string, StreamedChunk[]]>,
): {
  messages: ConversationMessage[];
  toolResults: Map<string, unknown>;
} {
  const messages: ConversationMessage[] = [];
  const toolResults = new Map<string, unknown>();

  for (const [id, parts] of entries) {
    const chunks = parts ?? [];
    if (chunks.some((chunk) => (chunk as StreamedToolResult).type === 'tool')) {
      const result = chunks.find(
        (chunk) => (chunk as StreamedToolResult).content !== undefined,
      ) as StreamedToolResult | undefined;
      if (result) {
        // 上游同样先认 tool_call_id：分片表键是 ToolMessage 的 id，不是调用 id
        toolResults.set(result.tool_call_id ?? result.id ?? id, result.content);
      }
      continue;
    }

    const message = mergeStreamedMessage(id, chunks);
    // 只有图片没有正文的消息也要留下：上游允许纯图片发送
    if (
      message.content ||
      message.image_content ||
      hasReasoning(message) ||
      message.tool_calls?.length
    ) {
      messages.push(message);
    }
  }

  return { messages, toolResults };
}

/** 把流式期间到达的工具结果并回发起它的那次调用。 */
export function attachToolResults(
  messages: ConversationMessage[],
  toolResults: Map<string, unknown>,
): ConversationMessage[] {
  if (toolResults.size === 0) return messages;

  return messages.map((message) => {
    if (!message.tool_calls?.length) return message;

    let changed = false;
    const toolCalls = message.tool_calls.map((toolCall) => {
      const key = toolCall.id ?? '';
      if (!key || toolCall.tool_call_result || !toolResults.has(key)) {
        return toolCall;
      }
      changed = true;
      return {
        ...toolCall,
        status: 'success',
        tool_call_result: { content: toolResults.get(key) },
      };
    });

    return changed ? { ...message, tool_calls: toolCalls } : message;
  });
}
