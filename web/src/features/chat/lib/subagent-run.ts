/**
 * 子智能体运行态的解析与展示视图。
 *
 * 数据源是 `agent_state.subagent_runs`（`SubAgentRunState`）与工具调用自身的结果；
 * 参照对齐 `toolRegistry.js` 的 `enrichSubagentToolCall`、`TaskTool.vue` 与
 * `SubagentLifecycleTool.vue`。
 */
import type { ChatToolCall } from '../api/agent-api';
import { parseToolCallArgs } from './tool-call';

/** 后端 `SubAgentRunState` 的运行状态白名单。 */
export const SUBAGENT_RUN_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancel_requested',
  'cancelled',
  'interrupted',
] as const;

export type SubagentRunStatus = (typeof SUBAGENT_RUN_STATUSES)[number];

/** 一条子智能体运行态；缺失的字段保持 undefined，读取层不猜。 */
export type SubagentRun = {
  id?: string;
  run_id?: string;
  subagent_slug?: string;
  subagent_name?: string;
  child_thread_id?: string;
  description?: string;
  status?: string;
  created_at?: string;
  completed_at?: string;
  error?: string | null;
  artifacts?: string[];
};

/**
 * 从 `agent_state` 里读取 `subagent_runs`；非数组丢弃，条目缺 `child_thread_id`
 * 或 `run_id` 的也丢弃（没有子线程就无法打开视图）。
 */
/** 子智能体分区的展示标题；两个名称字段都缺失时用这个兜底。 */
export const subagentRunTitle = (run: SubagentRun): string =>
  run.subagent_name || run.subagent_slug || '子智能体';

export function readSubagentRuns(agentState: unknown): SubagentRun[] {
  if (
    typeof agentState !== 'object' ||
    agentState === null ||
    Array.isArray(agentState)
  ) {
    return [];
  }
  const raw = (agentState as { subagent_runs?: unknown }).subagent_runs;
  if (!Array.isArray(raw)) return [];

  const runs: SubagentRun[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const childThreadId = nonEmptyString(record.child_thread_id);
    const runId = nonEmptyString(record.run_id);
    if (!childThreadId || !runId) continue;
    runs.push({
      id: nonEmptyString(record.id) || undefined,
      run_id: runId,
      subagent_slug: nonEmptyString(record.subagent_slug) || undefined,
      subagent_name: nonEmptyString(record.subagent_name) || undefined,
      child_thread_id: childThreadId,
      description: nonEmptyString(record.description) || undefined,
      status: nonEmptyString(record.status) || undefined,
      created_at: nonEmptyString(record.created_at) || undefined,
      completed_at: nonEmptyString(record.completed_at) || undefined,
      error:
        typeof record.error === 'string' && record.error ? record.error : null,
      artifacts: Array.isArray(record.artifacts)
        ? record.artifacts.filter(
            (path): path is string => typeof path === 'string' && Boolean(path),
          )
        : undefined,
    });
  }
  return runs;
}

/** 工具结果里的结构化载荷；解析不出时是空对象。 */
export type SubagentToolResult = Record<string, unknown>;

export const SUBAGENT_TOOL_IDS = [
  'task',
  'subagent_start',
  'subagent_status',
  'subagent_events',
  'subagent_cancel',
  'subagent_await',
] as const;

/** 生命周期工具的展示名；`task` 有自己的头部逻辑。 */
export const SUBAGENT_TOOL_LABELS: Record<string, string> = {
  subagent_start: '启动子智能体',
  subagent_status: '查询子智能体',
  subagent_events: '读取子智能体事件',
  subagent_cancel: '取消子智能体',
  subagent_await: '等待子智能体',
};

const STATUS_LABELS: Record<string, string> = {
  busy: '忙碌',
  cancelled: '已取消',
  cancel_requested: '取消中',
  completed: '已完成',
  existing: '已存在',
  failed: '失败',
  interrupted: '已中断',
  ok: '成功',
  pending: '等待中',
  running: '运行中',
  started: '已启动',
  success: '成功',
};

const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
]);

const FAILED_RUN_STATUSES = new Set(['failed', 'cancelled', 'interrupted']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 结果载荷；对象直接用，字符串尝试 JSON 解析，其余是空对象。 */
export function parseSubagentToolResult(
  toolCall: ChatToolCall | null | undefined,
): SubagentToolResult {
  const EMPTY: SubagentToolResult = {};
  const content = toolCall?.tool_call_result?.content;
  if (isRecord(content)) return content;
  if (typeof content === 'string' && content.trim()) {
    try {
      const parsed: unknown = JSON.parse(content);
      return isRecord(parsed) ? parsed : EMPTY;
    } catch {
      return EMPTY;
    }
  }
  return EMPTY;
}

/** 参数载荷；只认对象形状。 */
export function parseSubagentArgs(
  toolCall: ChatToolCall | null | undefined,
): Record<string, unknown> {
  const args = parseToolCallArgs(toolCall);
  return isRecord(args) ? args : {};
}

const nonEmptyString = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : '';

export const getSubagentToolId = (
  toolCall: ChatToolCall | null | undefined,
): string => toolCall?.name || toolCall?.function?.name || '';

export const isSubagentToolCall = (
  toolCall: ChatToolCall | null | undefined,
): boolean =>
  (SUBAGENT_TOOL_IDS as readonly string[]).includes(getSubagentToolId(toolCall));

/**
 * 展示名：结果里的名字优先，其次参数的 slug，最后退回「子智能体」。
 *
 * 参照的解析链在这里收敛成一个函数，渲染层不再各自取。
 */
export function resolveSubagentDisplayName(
  toolCall: ChatToolCall | null | undefined,
): string {
  const result = parseSubagentToolResult(toolCall);
  const args = parseSubagentArgs(toolCall);
  return (
    nonEmptyString(result.subagent_name) ||
    nonEmptyString(toolCall?.display_label) ||
    nonEmptyString(args.subagent_slug) ||
    nonEmptyString(result.subagent_slug) ||
    '子智能体'
  );
}

/** 生效状态：结果里的运行状态优先，其次参数，都拿不到是空串。 */
export function resolveSubagentEffectiveStatus(
  toolCall: ChatToolCall | null | undefined,
): string {
  const result = parseSubagentToolResult(toolCall);
  const args = parseSubagentArgs(toolCall);
  return (
    nonEmptyString(result.run_status) ||
    nonEmptyString(result.active_run_status) ||
    nonEmptyString(result.status) ||
    nonEmptyString(args.status) ||
    ''
  );
}

/** 状态的中文标签；白名单之外原样返回，没有状态是空串。 */
export function subagentStatusLabel(status: string): string {
  const normalized = status.trim();
  return STATUS_LABELS[normalized] || normalized;
}

export const isTerminalRunStatus = (status: string): boolean =>
  TERMINAL_RUN_STATUSES.has(status.trim());

export const isFailedRunStatus = (status: string): boolean =>
  FAILED_RUN_STATUSES.has(status.trim());

/**
 * task 调用的运行状态。
 *
 * 参照口径：有结果即完成（结果里标 failed 的算失败）；没有结果时只有活跃调用
 * 算运行中，同一子线程的 steer 历史调用视为已完成（结果待整轮结束后回填）。
 */
export function resolveTaskRunStatus(
  toolCall: ChatToolCall,
  options: { activeToolCallIds?: ReadonlySet<string> } = {},
): 'running' | 'completed' | 'failed' {
  if (toolCall.status === 'error') return 'failed';
  const result = parseSubagentToolResult(toolCall);
  const hasResult = Boolean(toolCall.tool_call_result);
  if (hasResult) {
    return nonEmptyString(result.status) === 'failed' ? 'failed' : 'completed';
  }
  const callId = nonEmptyString(toolCall.id);
  if (callId && options.activeToolCallIds?.has(callId)) return 'running';
  return 'completed';
}

export type SubagentMetaItem = { label: string; value: string };

const firstNonEmpty = (...values: unknown[]): string => {
  for (const value of values) {
    const text = nonEmptyString(value);
    if (text) return text;
  }
  return '';
};

/** 概览里最多展示 8 条事件的截断口径，与参照一致。 */
const EVENT_PREVIEW_LIMIT = 8;

const compactWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

/** 截到 limit 并以 `...` 收尾；空白归一后为空返回空串。 */
export function truncateText(value: unknown, limit = 60): string {
  const text = compactWhitespace(
    typeof value === 'string' ? value : String(value ?? ''),
  );
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export type SubagentLifecycleView = {
  /** 头部主文案：`启动子智能体: 名字` 或没有名字时只有动作名。 */
  title: string;
  /** 生效状态的中文标签；没有状态是空串。 */
  statusLabel: string;
  statusKind: 'running' | 'completed' | 'failed' | 'unknown';
  /** 头部细节：结果 message 优先，其次参数 description，再次 run id。 */
  detail: string;
  meta: SubagentMetaItem[];
  events: Array<{ seq: string; name: string }>;
  progressMessages: Array<{ kind: string; content: string }>;
  /** 结果正文；`output` 与 `error.message` 都能承载。 */
  resultText: string;
  /** 没有任何结构化内容时的 JSON 兜底。 */
  fallbackResult: string;
};

const PROGRESS_KIND_LABELS: Record<string, string> = {
  assistant_message: '消息',
  assistant_reasoning: '思考',
  tool_call: '工具',
  tool_call_delta: '工具',
};

/** 生命周期工具（subagent_*）的完整展示视图。 */
export function buildSubagentLifecycleView(
  toolCall: ChatToolCall,
): SubagentLifecycleView {
  const toolId = getSubagentToolId(toolCall);
  const args = parseSubagentArgs(toolCall);
  const result = parseSubagentToolResult(toolCall);

  const name = firstNonEmpty(
    result.subagent_name,
    toolCall.display_label,
    args.subagent_slug,
    result.subagent_slug,
  );
  const label = SUBAGENT_TOOL_LABELS[toolId] || '子智能体';
  const title = name ? `${label}: ${name}` : label;

  const status = resolveSubagentEffectiveStatus(toolCall);
  const statusLabel = subagentStatusLabel(status);
  const statusKind: SubagentLifecycleView['statusKind'] =
    isFailedRunStatus(status) || toolCall.status === 'error'
      ? 'failed'
      : status === 'running' || status === 'pending' || status === 'busy'
        ? 'running'
        : isTerminalRunStatus(status) ||
            ['started', 'existing', 'ok', 'success'].includes(status)
          ? 'completed'
          : 'unknown';

  const detail =
    truncateText(result.message) ||
    truncateText(args.description) ||
    (firstNonEmpty(result.run_id, args.run_id)
      ? `run: ${truncateText(firstNonEmpty(result.run_id, args.run_id), 18)}`
      : '');

  const runId = firstNonEmpty(result.run_id, args.run_id, result.active_run_id);
  const threadId = firstNonEmpty(
    result.thread_id,
    args.thread_id,
  );
  const slug = firstNonEmpty(result.subagent_slug, args.subagent_slug);
  const lastSeq = firstNonEmpty(result.last_seq, (result.progress as Record<string, unknown> | undefined)?.last_seq);
  const eventsRaw = Array.isArray(result.events) ? result.events : [];
  const meta: SubagentMetaItem[] = (
    [
      ['run_id', runId],
      ['thread_id', threadId],
      ['subagent_slug', slug],
      ['last_seq', lastSeq],
      ['events', eventsRaw.length ? `${eventsRaw.length} 条` : ''],
    ] as Array<[string, string]>
  )
    .filter(([, value]) => value)
    .map(([labelKey, value]) => ({ label: labelKey, value }));

  const events = eventsRaw
    .slice(0, EVENT_PREVIEW_LIMIT)
    .map((event, index) => {
      const record = isRecord(event) ? event : {};
      return {
        seq: nonEmptyString(record.seq) || String(index + 1),
        name: firstNonEmpty(record.event, record.type, record.method) || 'event',
      };
    });

  const progressRaw = (result.progress as Record<string, unknown> | undefined)
    ?.messages;
  const progressMessages = (
    Array.isArray(progressRaw) ? progressRaw : []
  )
    .map((message) => {
      const record = isRecord(message) ? message : {};
      return {
        kind: PROGRESS_KIND_LABELS[nonEmptyString(record.kind)] || '进度',
        content: truncateText(record.content),
      };
    })
    .filter((message) => message.content)
    .slice(0, 3);

  const resultValue = result.result;
  let resultText = '';
  if (typeof resultValue === 'string') {
    resultText = resultValue;
  } else if (isRecord(resultValue)) {
    resultText =
      nonEmptyString(resultValue.output) ||
      nonEmptyString((resultValue.error as Record<string, unknown> | undefined)?.message);
  }

  // 空对象与没有任何结构化内容的情况都没有兜底文本：交给通用渲染
  const hasMeaningfulResult = Object.keys(result).length > 0;
  const fallbackResult =
    !hasMeaningfulResult || resultText || events.length || progressMessages.length
      ? ''
      : JSON.stringify(result, null, 2);

  return {
    title,
    statusLabel,
    statusKind,
    detail,
    meta,
    events,
    progressMessages,
    resultText,
    fallbackResult,
  };
}

export type SubagentTaskView = {
  /** 头部主文案：名字（退回「子智能体」）。 */
  name: string;
  runStatus: ReturnType<typeof resolveTaskRunStatus>;
  runStatusLabel: string;
  /** 参数或运行态里的描述；截断口径与参照一致（50）。 */
  description: string;
  /** 子线程 id：运行态优先，其次参数 `thread_id`。 */
  childThreadId: string;
  /** 结果正文；ongoing 期间不流式，只展示工具结果。 */
  resultText: string;
};

/** task 调用的展示视图。 */
export function buildSubagentTaskView(
  toolCall: ChatToolCall,
  options: { activeToolCallIds?: ReadonlySet<string> } = {},
): SubagentTaskView {
  const args = parseSubagentArgs(toolCall);
  const runStatus = resolveTaskRunStatus(toolCall, options);
  const description = truncateText(
    args.description,
    50,
  );
  return {
    name: resolveSubagentDisplayName(toolCall),
    runStatus,
    runStatusLabel: subagentStatusLabel(
      runStatus === 'completed'
        ? 'completed'
        : runStatus === 'failed'
          ? 'failed'
          : 'running',
    ),
    description,
    childThreadId: firstNonEmpty(args.thread_id),
    resultText: nonEmptyString(toolCall.tool_call_result?.content)
      ? compactWhitespace(
          typeof toolCall.tool_call_result?.content === 'string'
            ? (toolCall.tool_call_result.content as string)
            : JSON.stringify(toolCall.tool_call_result?.content),
        )
      : '',
  };
}
