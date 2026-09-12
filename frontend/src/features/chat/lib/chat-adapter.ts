import type { ChatModelAdapter } from '@assistant-ui/react';

import { env } from '@/config/env';
import { getAccessToken, refreshAccessToken } from '@/lib/api-client';

import { useChatRunStore } from '../stores/chat-run-store';
import { useChatSettingsStore } from '../stores/chat-settings-store';
import type {
  ChatAgentInfo,
  ChatCitation,
  ChatImageSource,
  ChatMeta,
  ChatMode,
  ChatStep,
  ChatUsage,
} from '../types';
import { buildChatParam } from './chat-param';
import { parseD25Data, parseSseStream, type SseMessage } from './d25-sse';

/**
 * D25 SSE → assistant-ui LocalRuntime 适配器（chat / agent 同一实现）。
 *
 * 每轮：D18 参数（query_text + history）POST 到知识库问答端点，
 * delta 增量累积后以全量文本 yield（runtime 要求累计状态而非增量）；
 * meta / citation / images / step / usage / done / agent 写入 run store 供消息 UI 消费；
 * error 事件转成异常走 MessagePrimitive.Error 渲染。
 *
 * 两种模式只在端点上分叉（D35）：`/chat/stream` 固定检索一次后生成，
 * `/agent/stream` 由服务端图编排，额外推送 plan/act/grade/rewrite step 与 done.agent——
 * 事件协议一致，故共用解析与状态写入路径，不写第二套解析器（D38）。
 */

const kbChatUrl = (mode: ChatMode, kbName: string) =>
  `${env.API_URL}/api/v1/knowledge_bases/${encodeURIComponent(kbName)}/${mode}/stream`;

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

async function* openEventStream(
  mode: ChatMode,
  kbName: string,
  body: unknown,
  signal: AbortSignal,
): AsyncGenerator<SseMessage> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = getAccessToken();
    const response = await fetch(kbChatUrl(mode, kbName), {
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

/** step 事件 → ChatStep；缺 name 的畸形负载丢弃（前向兼容未知 step） */
const toStep = (payload: Record<string, unknown> | null): ChatStep | null => {
  const name = payload?.name;
  if (typeof name !== 'string' || !name) return null;
  return { name, detail: typeof payload?.detail === 'string' ? payload.detail : '' };
};

/** 工具名 → 调用次数（非法值丢弃；后端空对象表示无工具调用明细） */
const toToolCallsByName = (value: unknown): Record<string, number> | undefined => {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const entries = Object.entries(raw)
    .map(([tool, count]) => [tool, Number(count)] as const)
    .filter(([tool, count]) => tool && Number.isFinite(count) && count >= 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

/** done.agent → ChatAgentInfo；仅取已知字段，未知键忽略 */
const toAgentInfo = (value: unknown): ChatAgentInfo | undefined => {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const subQueries = raw.sub_queries;
  return {
    need_retrieval: typeof raw.need_retrieval === 'boolean' ? raw.need_retrieval : undefined,
    sub_queries: Array.isArray(subQueries) ? subQueries.map((item) => String(item)) : undefined,
    plan_rationale: typeof raw.plan_rationale === 'string' ? raw.plan_rationale : undefined,
    grade_score: typeof raw.grade_score === 'number' ? raw.grade_score : undefined,
    rewrites: typeof raw.rewrites === 'number' ? raw.rewrites : undefined,
    tool_calls: typeof raw.tool_calls === 'number' ? raw.tool_calls : undefined,
    tool_calls_by_name: toToolCallsByName(raw.tool_calls_by_name),
  };
};

const toImages = (value: unknown): ChatImageSource[] | undefined =>
  Array.isArray(value) ? (value as ChatImageSource[]) : undefined;

/** 组装指定模式的 ChatModelAdapter（chat / agent 共用，仅端点与 step 消费路径不同） */
export const createKbChatAdapter = (mode: ChatMode): ChatModelAdapter => ({
  async *run({ messages, abortSignal, context, unstable_assistantMessageId }) {
    const messageId = unstable_assistantMessageId ?? '';

    // 模型/思考等级来自 ModelContext（ModelSelector 元素注册的 config）
    const config = context?.config as Record<string, unknown> | undefined;
    const model = typeof config?.modelName === 'string' && config.modelName ? config.modelName : undefined;
    const rawEffort = config?.reasoningEffort;
    const thinkingLevel =
      typeof rawEffort === 'string' && ['off', 'low', 'medium', 'high'].includes(rawEffort)
        ? rawEffort
        : undefined;

    const param = buildChatParam(messages, { model, thinkingLevel });
    if (!param) return;

    const kbName = useChatSettingsStore.getState().kbName;
    if (!kbName) {
      throw new Error('请先选择要问答的知识库');
    }

    const runStore = useChatRunStore.getState();
    let text = '';

    try {
      for await (const message of openEventStream(mode, kbName, param, abortSignal)) {
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
            if (payload?.images !== undefined) {
              runStore.setImages(messageId, toImages(payload.images) ?? []);
            }
            break;
          case 'step': {
            const step = toStep(payload);
            if (step) runStore.appendStep(messageId, step);
            break;
          }
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
            // agent 的 done 是自包含负载：引用/视觉来源/agent 元数据随终态一并送达
            if (payload?.images !== undefined) {
              runStore.setImages(messageId, toImages(payload.images) ?? []);
            }
            if (payload?.agent !== undefined) {
              runStore.setAgent(messageId, toAgentInfo(payload.agent));
            }
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
});

/** 普通知识库问答（/chat/stream，D25 固定检索一次） */
export const chatAdapter: ChatModelAdapter = createKbChatAdapter('chat');

/** Agentic 知识库问答（/agent/stream，plan → act → grade/rewrite → generate） */
export const agentAdapter: ChatModelAdapter = createKbChatAdapter('agent');

/**
 * 按当前设置委派到 chat / agent 适配器的门面（runtime 订阅的实例）。
 *
 * 模式是运行期可变的设置（UI 开关），而 runtime 在挂载时固定适配器实例，
 * 故这里每轮 run 时读取一次 store，避免切换模式导致 runtime 重建（会丢会话）。
 */
export const kbChatAdapter: ChatModelAdapter = {
  run: (options) =>
    (useChatSettingsStore.getState().mode === 'agent' ? agentAdapter : chatAdapter).run(
      options,
    ),
};
