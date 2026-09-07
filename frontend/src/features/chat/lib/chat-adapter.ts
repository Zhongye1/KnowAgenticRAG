import type { ChatModelAdapter } from '@assistant-ui/react';

import { env } from '@/config/env';
import { getAccessToken, refreshAccessToken } from '@/lib/api-client';

import { useChatRunStore } from '../stores/chat-run-store';
import { useChatSettingsStore } from '../stores/chat-settings-store';
import type { ChatCitation, ChatMeta, ChatUsage } from '../types';
import { buildChatParam } from './chat-param';
import { parseD25Data, parseSseStream, type SseMessage } from './d25-sse';

/**
 * D25 SSE → assistant-ui LocalRuntime 适配器。
 *
 * 每轮：D18 参数（query_text + history）POST 到知识库 chat 端点，
 * delta 增量累积后以全量文本 yield（runtime 要求累计状态而非增量）；
 * meta / citation / usage / done 写入 run store 供消息 UI 消费；
 * error 事件转成异常走 MessagePrimitive.Error 渲染。
 */

const chatUrl = (kbName: string) =>
  `${env.API_URL}/api/v1/knowledge_bases/${encodeURIComponent(kbName)}/chat`;

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

async function* openEventStream(
  kbName: string,
  body: unknown,
  signal: AbortSignal,
): AsyncGenerator<SseMessage> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = getAccessToken();
    const response = await fetch(chatUrl(kbName), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });

    // 流式请求不经 axios 拦截器，401 时复用单飞刷新后重试一次
    if (response.status === 401 && attempt === 0) {
      const refreshed = await refreshAccessToken();
      if (refreshed) continue;
      throw new Error('登录已过期，请重新登录');
    }

    if (!response.ok) {
      throw new Error(`知识库对话请求失败（HTTP ${response.status}）`);
    }
    if (!response.body) {
      throw new Error('知识库对话响应为空');
    }

    yield* parseSseStream(response.body);
    return;
  }
}

export const chatAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal, unstable_assistantMessageId }) {
    const messageId = unstable_assistantMessageId ?? '';
    const param = buildChatParam(messages);
    if (!param) return;

    const kbName = useChatSettingsStore.getState().kbName;
    if (!kbName) {
      throw new Error('请先在顶部选择要问答的知识库');
    }

    const runStore = useChatRunStore.getState();
    let text = '';

    try {
      for await (const message of openEventStream(kbName, param, abortSignal)) {
        const payload = parseD25Data(message.data);

        switch (message.event) {
          case 'meta':
            runStore.setMeta(messageId, payload as ChatMeta | undefined);
            break;
          case 'citation':
            runStore.setCitations(
              messageId,
              Array.isArray(payload?.citations)
                ? (payload.citations as ChatCitation[])
                : [],
            );
            break;
          case 'delta': {
            const content = payload?.content;
            text += typeof content === 'string' ? content : '';
            if (text) yield { content: [{ type: 'text' as const, text }] };
            break;
          }
          case 'usage':
            runStore.setUsage(messageId, payload as ChatUsage | undefined);
            break;
          case 'done':
            runStore.setDone(
              messageId,
              typeof payload?.reason === 'string' ? payload.reason : undefined,
            );
            break;
          case 'error': {
            const detail =
              typeof payload?.msg === 'string' ? payload.msg : '服务异常，请稍后重试';
            const trace =
              typeof payload?.trace_id === 'string'
                ? `（trace_id: ${payload.trace_id}）`
                : '';
            throw new Error(`${detail}${trace}`);
          }
          default:
            break;
        }
      }

      if (!text) {
        yield { content: [{ type: 'text' as const, text: '（本次未返回回答内容）' }] };
      }
    } catch (error) {
      // 用户主动停止：保留已生成的部分内容，结束本轮
      if (isAbortError(error)) return;
      throw error;
    }
  },
};
