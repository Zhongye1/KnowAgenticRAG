import { InMemoryThreadListAdapter } from '@assistant-ui/react';
import { createAssistantStream, type AssistantStream } from 'assistant-stream';
import type { ThreadMessage } from '@assistant-ui/react';

import { extractMessageText, type ChatSourceMessage } from './chat-param';

/** 会话标题最大长度（超出截断） */
const MAX_TITLE_LENGTH = 30;
const DEFAULT_TITLE = '新对话';

const deriveTitle = (messages: readonly ThreadMessage[]): string => {
  const firstUser = messages.find((message) => message.role === 'user');
  if (!firstUser) return DEFAULT_TITLE;
  const text = extractMessageText(firstUser as ChatSourceMessage);
  if (!text) return DEFAULT_TITLE;
  const title = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
  return title || DEFAULT_TITLE;
};

/**
 * 问答线程列表 adapter：基于内存列表，覆写 generateTitle——
 * runtime 在新线程出现首条消息后自动调用，用首条用户消息生成标题，
 * 侧边栏"最近对话"因此显示真实会话名而不是"新对话"。
 *
 * 两处签名细节都是为了贴住 `@assistant-ui/react@0.15.18`（上游自己不一致，升级时回看）：
 * - `generateTitle` 的基类声明是**无参**，它实现的 `RemoteThreadListAdapter` 接口却是
 *   `(remoteId, messages)` 两参，故这里写成可选参数，两边都满足；
 * - 基类声明返回 `Promise<AssistantStream>`，而 `createAssistantStream()` 返回的是
 *   `ReadableStream`（`AssistantStream` 只是它的类型别名），所以要 `async` 包一层。
 * 运行期框架仍按接口传 `(remoteId, messages)`（见 core 的
 * `RemoteThreadListThreadListRuntimeCore`），标题行为不变；真拿不到消息时退化为默认标题。
 */
export class ChatThreadListAdapter extends InMemoryThreadListAdapter {
  override async generateTitle(
    _remoteId?: string,
    messages?: readonly ThreadMessage[],
  ): Promise<AssistantStream> {
    const title = deriveTitle(messages ?? []);
    return createAssistantStream((controller) => {
      controller.appendText(title);
    });
  }
}
