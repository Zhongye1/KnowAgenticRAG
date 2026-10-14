/**
 * Token 用量的展示计算。
 *
 * 数值格式化、上下文构成分段、按模型分桶的调用统计、上下文占比与告警档位。
 * 缺失值一律显示「未上报」/「-」，不猜也不补零。
 */

/** 换算单位。 */
const K_UNIT = 1024;
const M_UNIT = K_UNIT * 1000;

/** 任意值转有限数字；空串、布尔与非数字一律视为缺失。 */
const toFiniteNumber = (value: unknown): number | null => {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value === 'boolean'
  ) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** 用量数字：缺失为 `-`，不足 1024 取整，之后按 K/M 保留三位有效数字。 */
const formatTokenCount = (value: unknown): string => {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return '-';
  if (numeric >= M_UNIT) return `${Number((numeric / M_UNIT).toPrecision(3))}M`;
  if (numeric >= K_UNIT) return `${Number((numeric / K_UNIT).toPrecision(3))}K`;
  return String(Math.round(numeric));
};

/** 比例：缺失为「未上报」，其余夹到 0..1 后取整百分比。 */
const formatTokenRatio = (value: unknown): string => {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return '未上报';
  return `${Math.round(Math.max(0, Math.min(numeric, 1)) * 100)}%`;
};

/** `token_usage` 是后端 state 里的自由 dict，只取用到的字段。 */
export type TokenUsage = Record<string, unknown>;

/**
 * 从线程 state 里取出可用的 `token_usage`；不是非空对象（含数组、字符串）时返回 null。
 * 排除数组形状的值，避免把异常值渲染成 0。
 */
export const readTokenUsage = (agentState: unknown): TokenUsage | null => {
  const usage = (agentState as { token_usage?: unknown } | null | undefined)
    ?.token_usage;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  return usage as TokenUsage;
};

/** 上下文构成的一段。 */
export type TokenUsageSegment = {
  key: string;
  label: string;
  value: number;
  /** 占整条构成条的比例，形如 `12.34%`。 */
  percent: string;
  valueLabel: string;
};

/** 单个模型桶的展示项。 */
export type TokenUsageModelItem = {
  key: string;
  name: string;
  responseModel: string;
  callCount: number;
  io: string;
  cache: string;
  reasoning: string;
};

const readNumber = (usage: TokenUsage, key: string): number | null =>
  toFiniteNumber(usage[key]);

/** 上下文构成分段；值为 0 的段不展示。 */
export const getTokenUsageSegments = (
  usage: TokenUsage,
): TokenUsageSegment[] => {
  const summaryActive = Boolean(usage.summary_active);
  const summaryTokens = summaryActive
    ? Math.max(readNumber(usage, 'summary_message_tokens') ?? 0, 0)
    : 0;
  const llmMessageTokens = Math.max(
    readNumber(usage, 'llm_messages_tokens') ?? 0,
    0,
  );
  const hasSplitMessageTokens =
    toFiniteNumber(usage.llm_content_message_tokens) !== null ||
    toFiniteNumber(usage.llm_tool_message_tokens) !== null;
  const contentMessageTokens = hasSplitMessageTokens
    ? Math.max(readNumber(usage, 'llm_content_message_tokens') ?? 0, 0)
    : Math.max(llmMessageTokens - summaryTokens, 0);
  const toolMessageTokens = Math.max(
    readNumber(usage, 'llm_tool_message_tokens') ?? 0,
    0,
  );
  const stateMessageTokensBeforeCall = Math.max(
    toFiniteNumber(
      usage.state_messages_tokens_before_call ?? usage.state_messages_tokens,
    ) ?? 0,
    0,
  );
  const cutMessageTokens = Math.max(
    stateMessageTokensBeforeCall - llmMessageTokens,
    0,
  );
  const llmMessageCount = Math.max(
    readNumber(usage, 'llm_message_count') ?? 0,
    0,
  );
  const contentMessageCount = hasSplitMessageTokens
    ? Math.max(readNumber(usage, 'llm_content_message_count') ?? 0, 0)
    : Math.max(llmMessageCount - (summaryActive ? 1 : 0), 0);
  const toolMessageCount = Math.max(
    readNumber(usage, 'llm_tool_message_count') ?? 0,
    0,
  );
  const stateMessageCountBeforeCall = Math.max(
    toFiniteNumber(
      usage.state_message_count_before_call ?? usage.state_message_count,
    ) ?? 0,
    0,
  );
  const cutMessageCount = Math.max(
    stateMessageCountBeforeCall - llmMessageCount,
    0,
  );
  const systemTokens = Math.max(readNumber(usage, 'system_tokens') ?? 0, 0);
  const toolsTokens = Math.max(readNumber(usage, 'tools_tokens') ?? 0, 0);
  const inputTokens = Math.max(readNumber(usage, 'llm_input_tokens') ?? 0, 0);
  const raw = [
    { key: 'system', label: '系统提示', value: systemTokens },
    {
      key: 'tools',
      label: `工具定义 (${readNumber(usage, 'tool_count') ?? 0})`,
      value: toolsTokens,
    },
    {
      key: 'messages',
      label:
        contentMessageCount > 0
          ? `内容消息 (${contentMessageCount})`
          : '内容消息',
      value: contentMessageTokens,
    },
    {
      key: 'tool-messages',
      label:
        toolMessageCount > 0 ? `工具消息 (${toolMessageCount})` : '工具消息',
      value: toolMessageTokens,
    },
    { key: 'summary', label: '摘要', value: summaryTokens },
    {
      key: 'cut',
      label: cutMessageCount > 0 ? `已压缩 (${cutMessageCount})` : '已压缩',
      value: cutMessageTokens,
    },
  ].filter((segment) => segment.value > 0);

  const accountedInputTokens = llmMessageTokens + systemTokens + toolsTokens;
  if (inputTokens > accountedInputTokens) {
    raw.push({
      key: 'overhead',
      label: '其他',
      value: inputTokens - accountedInputTokens,
    });
  }

  const segmentTotal = raw.reduce((sum, segment) => sum + segment.value, 0);
  const total = Math.max(segmentTotal, 1);
  return raw.map((segment) => ({
    ...segment,
    percent: `${Math.max(0, Math.min((segment.value / total) * 100, 100)).toFixed(2)}%`,
    valueLabel: formatTokenCount(segment.value),
  }));
};

/** 构成条的总量：优先真实输入 token，否则用分段之和（不含被压缩部分）。 */
const getTokenUsageStackTotal = (usage: TokenUsage): number => {
  const inputTokens = readNumber(usage, 'llm_input_tokens');
  if (inputTokens !== null) return Math.max(inputTokens, 0);
  return getTokenUsageSegments(usage)
    .filter((segment) => segment.key !== 'cut')
    .reduce((sum, segment) => sum + segment.value, 0);
};

/** 上下文上限：优先摘要触发阈值，其次模型上下文窗口，都没有则未知。 */
const getTokenUsageStackLimit = (usage: TokenUsage): number | null => {
  const summaryTrigger = readNumber(usage, 'summary_trigger_tokens');
  if (summaryTrigger && summaryTrigger > 0) return summaryTrigger;
  const contextWindow = readNumber(usage, 'context_window');
  if (contextWindow && contextWindow > 0) return contextWindow;
  return null;
};

/** 上下文占比；上限未知时为 null（界面显示 `--`）。 */
export const getTokenUsageRatio = (usage: TokenUsage): number | null => {
  const limit = getTokenUsageStackLimit(usage);
  if (limit === null) return null;
  return Math.max(0, Math.min(getTokenUsageStackTotal(usage) / limit, 1));
};

/** 头部百分比文案：未知为 `--`，不足 1% 显示 `<1%`。 */
export const getTokenUsagePercentLabel = (ratio: number | null): string => {
  if (ratio === null) return '--';
  const percent = ratio * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
};

/** 占比档位：≥90% 危险，≥75% 警告。 */
export const getTokenUsageTone = (
  ratio: number | null,
): 'danger' | 'warning' | 'normal' => {
  if (ratio === null) return 'normal';
  if (ratio >= 0.9) return 'danger';
  if (ratio >= 0.75) return 'warning';
  return 'normal';
};

/** 头部右侧的 `已用 / 上限` 文案。 */
export const getTokenUsageHeadLabel = (usage: TokenUsage): string => {
  const total = formatTokenCount(getTokenUsageStackTotal(usage));
  const limit = getTokenUsageStackLimit(usage);
  return limit === null ? total : `${total} / ${formatTokenCount(limit)}`;
};

/**
 * 用量环的悬浮说明。回退顺序与参照 `formatContextUsageTooltip` 一致：上限未知时只报已用，
 * 上限已知时报「占比 · 已用 / 上限」。
 *
 * 数字格式用本模块自己的 `formatTokenCount` / `getTokenUsagePercentLabel`，与用量卡片同源；
 * 参照那边是一位小数百分比与 1000 进制的 K/M，两者刻意不同——同一个用量在卡片与环上
 * 必须给出同样的数字。
 */
export const getTokenUsageTooltipLabel = (usage: TokenUsage): string => {
  if (getTokenUsageStackLimit(usage) === null) {
    return `${formatTokenCount(getTokenUsageStackTotal(usage))} 上下文已使用`;
  }

  return `${getTokenUsagePercentLabel(
    getTokenUsageRatio(usage),
  )} · ${getTokenUsageHeadLabel(usage)} 上下文已使用`;
};

/** 进度条的无障碍文案。 */
export const getTokenUsageAriaLabel = (usage: TokenUsage): string => {
  const ratio = getTokenUsageRatio(usage);
  if (ratio === null) {
    return `上下文上限未知，当前估算 ${formatTokenCount(getTokenUsageStackTotal(usage))}`;
  }
  return `上下文占用 ${getTokenUsagePercentLabel(ratio)}`;
};

/** 当前对话的累计 token，缺失为 null。 */
export const getThreadTotalLabel = (usage: TokenUsage): string | null => {
  const thread = usage.thread as
    { total?: { total_tokens?: unknown } } | undefined;
  const total = toFiniteNumber(thread?.total?.total_tokens);
  return total === null ? null : formatTokenCount(Math.max(total, 0));
};

/** 累计缓存命中率：没有观测到缓存调用时为 null。 */
export const getCacheHitLabel = (usage: TokenUsage): string | null => {
  const thread = usage.thread as
    { models?: Record<string, Record<string, unknown>> } | undefined;
  const models = thread?.models;
  if (
    !models ||
    typeof models !== 'object' ||
    Object.keys(models).length === 0
  ) {
    return null;
  }
  let observedInputTokens = 0;
  let cacheReadTokens = 0;
  let observedCalls = 0;
  for (const bucket of Object.values(models)) {
    if (!bucket || typeof bucket !== 'object') continue;
    observedInputTokens += Math.max(
      toFiniteNumber(bucket.cache_observed_input_tokens) ?? 0,
      0,
    );
    cacheReadTokens += Math.max(
      toFiniteNumber(bucket.cache_read_input_tokens) ?? 0,
      0,
    );
    observedCalls += Math.max(
      toFiniteNumber(bucket.cache_observed_call_count) ?? 0,
      0,
    );
  }
  if (observedCalls <= 0 || observedInputTokens <= 0) return null;
  return formatTokenRatio(cacheReadTokens / observedInputTokens);
};

/** 按模型分桶的调用统计；桶来自 `token_usage.thread.models`。 */
export const getModelUsageItems = (
  usage: TokenUsage,
): TokenUsageModelItem[] => {
  const thread = usage.thread as
    { models?: Record<string, Record<string, unknown>> } | undefined;
  const models = thread?.models;
  if (!models || typeof models !== 'object') return [];

  return Object.entries(models).map(([bucketKey, bucket]) => {
    const model = (bucket?.model ?? {}) as Record<string, unknown>;
    const modelUsage = (bucket?.usage ?? {}) as Record<string, unknown>;
    const responseModelIds = Array.isArray(model.response_model_ids)
      ? [
          ...new Set(
            model.response_model_ids.filter(
              (item): item is string =>
                typeof item === 'string' && item.length > 0,
            ),
          ),
        ]
      : [];
    const responseModels = responseModelIds.filter(
      (item) => item !== model.configured_model_id,
    );
    const cacheRatio = toFiniteNumber(bucket?.cache_hit_ratio);
    const cacheObservedCalls =
      toFiniteNumber(bucket?.cache_observed_call_count) ?? 0;
    const outputDetails = modelUsage.output_token_details as
      { reasoning?: unknown } | undefined;
    const reasoning = toFiniteNumber(outputDetails?.reasoning);

    return {
      key: bucketKey,
      name: String(model.configured_model_spec || bucketKey),
      responseModel:
        responseModels.length > 1
          ? `${responseModels[0]} 等 ${responseModels.length} 个模型`
          : (responseModels[0] ?? ''),
      callCount: Math.max(toFiniteNumber(bucket?.model_call_count) ?? 0, 0),
      io: `${formatTokenCount(modelUsage.input_tokens)} / ${formatTokenCount(modelUsage.output_tokens)}`,
      cache:
        cacheObservedCalls === 0
          ? ''
          : cacheRatio === null
            ? formatTokenCount(bucket?.cache_read_input_tokens)
            : `${formatTokenCount(bucket?.cache_read_input_tokens)} · ${formatTokenRatio(cacheRatio)}`,
      reasoning: reasoning === null ? '' : formatTokenCount(reasoning),
    };
  });
};

/** 明细里的补充行：最近一次调用的输入输出。 */
export const getLatestCallLabel = (usage: TokenUsage): string | null => {
  const latest = usage.latest as
    { usage?: Record<string, unknown> } | undefined;
  if (!latest?.usage || typeof latest.usage !== 'object') return null;
  return `输入 ${formatTokenCount(latest.usage.input_tokens)} · 输出 ${formatTokenCount(latest.usage.output_tokens)}`;
};

/**
 * 构成条的堆叠分段：按上限累计裁剪，剔除被压缩部分与零宽段。
 *
 * 与 `getTokenUsageSegments` 的 `percent` 不同：那里的分母包含被压缩的 token，
 * 只用于明细列表的占比说明，不能直接当条宽。
 */
export const getTokenUsageBarSegments = (
  usage: TokenUsage,
): Array<TokenUsageSegment & { width: string }> => {
  const limit =
    getTokenUsageStackLimit(usage) ??
    Math.max(getTokenUsageStackTotal(usage), 1);
  let remaining = limit;
  return getTokenUsageSegments(usage)
    .filter((segment) => segment.key !== 'cut')
    .map((segment) => {
      const value = Math.min(segment.value, Math.max(remaining, 0));
      remaining -= value;
      return {
        ...segment,
        width: `${Math.max(0, Math.min((value / limit) * 100, 100)).toFixed(2)}%`,
      };
    })
    .filter((segment) => segment.value > 0 && segment.width !== '0.00%');
};
