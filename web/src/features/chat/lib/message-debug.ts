/**
 * 消息时序调试的纯逻辑。
 *
 * 移植上游 `utils/messageDebug.js`：把原始历史消息（含流式分片）转成调试条目、按连续 run_id
 * 分组、做角色筛选与关键词搜索、格式化 tokens 与 run id，并从后端响应里挑出可安全打开的
 * Langfuse 链接。
 *
 * 消息形状按「调试视图看原始载荷」处理：`model`/`usage` 这些字段后端不保证存在，因此入参类型
 * 写成宽松的 Record，读不到就不显示，而不是在类型里假装它们都有。
 */

/** 调试条目：原始消息 + 展示字段。 */
export type DebugMessage = Record<string, unknown> & {
  id?: number | string;
  type?: string;
  role?: string;
  content?: unknown;
  run_id?: string | null;
  request_id?: string | null;
  error_type?: string | null;
  error_message?: string | null;
  model?: string;
  usage?: DebugUsage | null;
  extra_metadata?: Record<string, unknown> | null;
  tool_calls?: Array<Record<string, unknown>> | null;
};

export type DebugUsage = {
  total_tokens?: number;
  total?: number;
  prompt_tokens?: number;
  prompt?: number;
  completion_tokens?: number;
  completion?: number;
};

export type MessageDebugRole =
  'human' | 'system' | 'tool' | 'ai' | 'error' | 'other';

export type MessageDebugEntry = {
  id: string;
  runId: string | null;
  model: string;
  usage?: DebugUsage | null;
  raw: DebugMessage;
  role: MessageDebugRole;
  roleLabel: string;
  summary: string;
};

export type MessageDebugGroup = {
  key: string;
  runId: string | null;
  items: MessageDebugEntry[];
};

/** 内容压成单行摘要。 */
const summarizeContent = (content: unknown, limit: number): string => {
  if (typeof content !== 'string') return '';
  return content.replace(/\s+/g, ' ').trim().slice(0, limit);
};

/** AI 消息里去重后的工具名。 */
export const extractMessageToolNames = (
  message?: DebugMessage | null,
): string[] => {
  const toolCalls = Array.isArray(message?.tool_calls)
    ? message.tool_calls
    : [];
  return [
    ...new Set(
      toolCalls
        .map((toolCall) => {
          const name = toolCall?.name ?? toolCall?.tool_name;
          if (typeof name === 'string' && name) return name;
          const fn = toolCall?.function as { name?: unknown } | undefined;
          return typeof fn?.name === 'string' ? fn.name : undefined;
        })
        .filter((name): name is string => Boolean(name)),
    ),
  ];
};

const readMetadataString = (
  message: DebugMessage,
  key: 'request_id' | 'run_id',
): string | null => {
  const metadata = message?.extra_metadata as Record<string, unknown> | null;
  const fromMetadata = metadata?.[key];
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) {
    return fromMetadata.trim();
  }
  const direct = message?.[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  return null;
};

/**
 * 把历史消息与流式消息合成调试列表：历史顺序为准，流式的 AI 消息按 run_id 就地替换，
 * 其余流式消息追加在后面。上游 `mergeMessageDebugMessages` 同口径。
 */
export const mergeMessageDebugMessages = (
  history?: DebugMessage[] | null,
  ongoing?: DebugMessage[] | null,
  activeRunId?: string | null,
): DebugMessage[] => {
  const persisted = Array.isArray(history) ? history : [];
  const live = Array.isArray(ongoing) ? ongoing : [];
  const persistedIds = new Set(
    persisted.map((message) => String(message?.id ?? '')),
  );
  const persistedRequestIds = new Set(
    persisted
      .filter((message) => message?.type === 'human')
      .map((message) => readMetadataString(message, 'request_id'))
      .filter(Boolean),
  );
  const pending = live.filter((message) => {
    if (persistedIds.has(String(message?.id ?? ''))) return false;
    return (
      message?.type !== 'human' ||
      !persistedRequestIds.has(readMetadataString(message, 'request_id'))
    );
  });

  if (!activeRunId) return [...persisted, ...pending];

  const liveAi = pending.filter((message) => message?.type === 'ai');
  let replacedAiCount = 0;
  const merged: DebugMessage[] = [];
  for (const message of persisted) {
    if (
      message?.type === 'ai' &&
      readMetadataString(message, 'run_id') === activeRunId
    ) {
      if (replacedAiCount < liveAi.length) {
        merged.push(liveAi[replacedAiCount]);
        replacedAiCount += 1;
      } else {
        merged.push(message);
      }
      continue;
    }
    merged.push(message);
  }

  let skippedAiCount = 0;
  const remainingLive = pending.filter((message) => {
    if (message?.type !== 'ai' || skippedAiCount >= replacedAiCount)
      return true;
    skippedAiCount += 1;
    return false;
  });
  return [...merged, ...remainingLive];
};

/** 原始顺序不变，逐条补出展示字段。 */
export const buildMessageDebugEntries = (
  messages?: DebugMessage[] | null,
): MessageDebugEntry[] => {
  const source = Array.isArray(messages) ? messages : [];

  return source.map((message, index) => {
    const type = String(message?.type ?? message?.role ?? 'unknown');
    const metadata = message?.extra_metadata as Record<string, unknown> | null;
    const common = {
      id: String(message?.id ?? `message-${index}`),
      runId: readMetadataString(message, 'run_id'),
      model:
        (typeof message?.model === 'string' && message.model) ||
        (typeof metadata?.model === 'string' ? metadata.model : ''),
      usage:
        message?.usage ?? (metadata?.usage as DebugUsage | undefined) ?? null,
      raw: message,
    };
    const isError = Boolean(message?.error_type || message?.error_message);

    if (type === 'human' || type === 'user') {
      return {
        ...common,
        role: 'human' as const,
        roleLabel: 'User',
        summary: summarizeContent(message.content, 200) || '[用户输入/附件]',
      };
    }

    if (type === 'system') {
      return {
        ...common,
        role: 'system' as const,
        roleLabel: 'System',
        summary: summarizeContent(message.content, 200) || '[系统消息]',
      };
    }

    if (type === 'tool') {
      const toolName =
        (typeof message?.name === 'string' && message.name) ||
        (typeof message?.tool_name === 'string' ? message.tool_name : '');
      const content = summarizeContent(message.content, 180);
      return {
        ...common,
        role: 'tool' as const,
        roleLabel: 'Tool',
        summary:
          [toolName ? `工具: ${toolName}` : '', content]
            .filter(Boolean)
            .join(' | ') || '[工具结果]',
      };
    }

    if (type === 'ai' || type === 'assistant') {
      const toolNames = extractMessageToolNames(message);
      const content = summarizeContent(message.content, 160);
      const summary = isError
        ? message.error_message || message.error_type || '执行异常'
        : [content, toolNames.length ? `工具: ${toolNames.join('、')}` : '']
            .filter(Boolean)
            .join(' | ') || '[AI 回复]';
      return {
        ...common,
        role: isError ? ('error' as const) : ('ai' as const),
        roleLabel: isError ? 'Error' : toolNames.length ? 'AI · Tools' : 'AI',
        summary: String(summary),
      };
    }

    return {
      ...common,
      role: 'other' as const,
      roleLabel: type,
      summary: summarizeContent(message?.content, 200) || '[未知消息]',
    };
  });
};

/** 按连续 run_id 分组，保持事实顺序。 */
export const groupMessageDebugEntries = (
  entries?: MessageDebugEntry[] | null,
): MessageDebugGroup[] => {
  const source = Array.isArray(entries) ? entries : [];
  const groups: MessageDebugGroup[] = [];

  source.forEach((item) => {
    const runId =
      typeof item?.runId === 'string' && item.runId.trim()
        ? item.runId.trim()
        : null;
    let group = groups.at(-1);
    if (!group || group.runId !== runId) {
      group = {
        key: `${runId ?? 'unassigned'}-${groups.length}`,
        runId,
        items: [],
      };
      groups.push(group);
    }
    group.items.push(item);
  });

  return groups;
};

export type MessageDebugFilter = 'all' | MessageDebugRole;

/** 角色筛选标签（含每类数量）。 */
export const messageDebugFilterTabs = (
  entries: MessageDebugEntry[],
): Array<{ key: MessageDebugFilter; label: string; count: number }> => [
  { key: 'all', label: '全部', count: entries.length },
  {
    key: 'human',
    label: '用户',
    count: entries.filter((item) => item.role === 'human').length,
  },
  {
    key: 'ai',
    label: 'AI',
    count: entries.filter((item) => item.role === 'ai').length,
  },
  {
    key: 'tool',
    label: '工具',
    count: entries.filter((item) => item.role === 'tool').length,
  },
  {
    key: 'error',
    label: '错误',
    count: entries.filter((item) => item.role === 'error').length,
  },
  {
    key: 'system',
    label: '系统',
    count: entries.filter((item) => item.role === 'system').length,
  },
];

/** 角色筛选 + 关键词搜索（角色名、摘要、模型与原始 JSON 都参与匹配）。 */
export const filterMessageDebugEntries = (
  entries: MessageDebugEntry[],
  filter: MessageDebugFilter,
  query: string,
): MessageDebugEntry[] => {
  let list = entries;
  if (filter !== 'all') {
    list = list.filter((item) => item.role === filter);
  }
  const needle = query.trim().toLowerCase();
  if (!needle) return list;
  return list.filter((item) => {
    const haystack = [
      item.roleLabel.toLowerCase(),
      item.summary.toLowerCase(),
      String(item.model).toLowerCase(),
      JSON.stringify(item.raw ?? '').toLowerCase(),
    ];
    return haystack.some((value) => value.includes(needle));
  });
};

/** tokens 摘要：`1.2k tokens` / `340 tokens`；没有用量给空串。 */
export const formatDebugTokens = (usage?: DebugUsage | null): string => {
  if (!usage) return '';
  const total = usage.total_tokens ?? usage.total ?? 0;
  const prompt = usage.prompt_tokens ?? usage.prompt ?? 0;
  const completion = usage.completion_tokens ?? usage.completion ?? 0;
  if (!total && !prompt && !completion) return '';
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k tokens`;
  return `${total} tokens`;
};

export const formatDebugTokenTooltip = (usage?: DebugUsage | null): string =>
  usage
    ? `输入: ${usage.prompt_tokens ?? 0}, 输出: ${usage.completion_tokens ?? 0}, 总计: ${usage.total_tokens ?? 0}`
    : '';

/** run id 过长时掐头去尾。 */
export const formatRunId = (runId: string): string => {
  if (runId.length <= 18) return runId;
  return `${runId.slice(0, 8)}…${runId.slice(-6)}`;
};

/** 从后端响应里挑出可安全打开的 http(s) Langfuse 链接。 */
export const resolveLangfuseRunUrl = (payload?: unknown): string | null => {
  const data = payload as { available?: unknown; url?: unknown } | null;
  if (data?.available !== true || typeof data?.url !== 'string') return null;
  const value = data.url.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? value
      : null;
  } catch {
    return null;
  }
};
