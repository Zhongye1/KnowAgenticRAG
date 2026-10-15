/**
 * 流事件里的待审批中断提取。
 *
 * 纯计算：从流事件里取出待审批中断并归一成面板消费的形状。线程态的读写与消息拉取属于
 * UI 组装，不在本模块内。
 */

import type { ToolApprovalRequest } from './tool-approval';

/** 需要弹审批的状态：问题回答与工具审批。 */
export const APPROVAL_REQUIRED_STATUSES: ReadonlySet<string> = new Set([
  'ask_user_question_required',
  'human_approval_required',
]);

/** 规范化后的选项。 */
export interface NormalizedQuestionOption {
  label: string;
  value: string;
  description?: string;
}

/** 规范化后的问题项。 */
export interface NormalizedQuestion {
  questionId: string;
  question: string;
  options: NormalizedQuestionOption[];
  multiSelect: boolean;
  allowOther: boolean;
  operation: string;
}

/** approval 载荷字段：action_requests 与 review_configs 必须一一对应。 */
export interface ToolApprovalPayloadFields {
  action_requests?: unknown;
  review_configs?: unknown;
}

/** 流事件分片里与本模块相关的字段；字段可缺省，畸形值由提取函数容错。 */
export interface PendingInterruptChunk {
  status?: string;
  thread_id?: string;
  run_id?: string;
  questions?: unknown;
  source?: string;
  approval?: ToolApprovalPayloadFields | null;
  interrupt_info?: {
    questions?: unknown;
    source?: string;
    approval?: ToolApprovalPayloadFields | null;
  } | null;
}

/** 工具审批中断：`actionRequests` 与后端 review_configs 一一对应。 */
export interface ToolApprovalInterrupt {
  kind: 'tool_approval';
  actionRequests: ToolApprovalRequest[];
  status: string;
  threadId: string;
  interruptedRunId: string | null;
}

/** 提问中断：`questions` 已由 normalizeQuestions 规范化。 */
export interface QuestionInterrupt {
  kind: 'question';
  questions: NormalizedQuestion[];
  source: string;
  status: string;
  threadId: string;
  interruptedRunId: string | null;
}

/** 从流事件里提取出的待处理中断。 */
export type PendingInterrupt = ToolApprovalInterrupt | QuestionInterrupt;

const DEFAULT_OTHER_OPTION_VALUE = '__other__';

const WRAPPER_OPTION_KEYS = [
  'item',
  'items',
  'options',
  'list',
  'choices',
  'data',
];
const WRAPPER_QUESTION_KEYS = ['questions', 'items', 'item', 'list', 'data'];

/**
 * 提问工具的问题归一：JSON 字符串解包、包装键、`其他` 选项注入等分支都在这里判定。
 */
const normalizeCollection = (
  value: unknown,
  wrapperKeys: readonly string[],
  isItem: (item: Record<string, unknown>) => boolean,
  mappingAsOptions = false,
): unknown[] => {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== 'string') value = parsed;
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  for (const key of wrapperKeys) {
    if (!(key in record)) continue;
    const wrapped = record[key];
    if (Array.isArray(wrapped)) return wrapped;
    if (
      wrapped &&
      typeof wrapped === 'object' &&
      isItem(wrapped as Record<string, unknown>)
    ) {
      return [wrapped];
    }
  }

  if (isItem(record)) return [value];
  return mappingAsOptions
    ? Object.entries(record).map(([option, label]) => ({
        label: String(label || ''),
        value: String(option || ''),
      }))
    : [];
};

const parseBool = (val: unknown, defaultVal = false): boolean => {
  if (val === undefined || val === null) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 't'].includes(s)) return true;
    if (['false', '0', 'no', 'n', 'f', ''].includes(s)) return false;
  }
  return defaultVal;
};

const isOtherOption = (option: NormalizedQuestionOption): boolean => {
  if (!option || typeof option !== 'object') return false;
  const label = String(option.label || '')
    .trim()
    .toLowerCase();
  const value = String(option.value || '')
    .trim()
    .toLowerCase();

  return (
    value === DEFAULT_OTHER_OPTION_VALUE ||
    value === 'other' ||
    label.includes('其他') ||
    label.includes('other')
  );
};

const normalizeOptions = (rawOptions: unknown): NormalizedQuestionOption[] => {
  const target = normalizeCollection(
    rawOptions,
    WRAPPER_OPTION_KEYS,
    (item) => Boolean(item.label || item.value),
    true,
  );

  return target
    .map((item): NormalizedQuestionOption | null => {
      if (item && typeof item === 'object') {
        const option = item as Record<string, unknown>;
        const label = String(
          option.label || option.value || option.title || option.text || '',
        ).trim();
        const value = String(
          option.value || option.label || option.id || option.key || '',
        ).trim();
        const description = String(
          option.description || option.desc || '',
        ).trim();
        if (label && value) {
          const res: NormalizedQuestionOption = { label, value };
          if (description) {
            res.description = description;
          }
          return res;
        }
        return null;
      }

      const text = String(item || '').trim();
      return text ? { label: text, value: text } : null;
    })
    .filter((option): option is NormalizedQuestionOption => Boolean(option));
};

const normalizeQuestions = (rawQuestions: unknown): NormalizedQuestion[] => {
  const target = normalizeCollection(
    rawQuestions,
    WRAPPER_QUESTION_KEYS,
    (item) => Boolean(item.question || item.title || item.text),
  );

  return target
    .map((item, index): NormalizedQuestion | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;

      const question = String(
        record.question || record.title || record.text || '',
      ).trim();
      if (!question) return null;

      const questionId =
        String(
          record.questionId || record.question_id || record.id || '',
        ).trim() || `q-${index + 1}`;
      const operation = String(record.operation || '').trim();
      const allowOther = parseBool(
        record.allowOther ?? record.allow_other,
        true,
      );
      const multiSelect = parseBool(
        record.multiSelect ?? record.multi_select,
        false,
      );
      const optionsVal =
        record.options !== undefined ? record.options : record.choices;
      const baseOptions = normalizeOptions(optionsVal || []);
      const hasOtherOption = baseOptions.some((option) =>
        isOtherOption(option),
      );
      const options =
        allowOther && !hasOtherOption
          ? [
              ...baseOptions,
              { label: '其他', value: DEFAULT_OTHER_OPTION_VALUE },
            ]
          : baseOptions;

      return {
        questionId,
        question,
        options,
        multiSelect,
        allowOther,
        operation,
      };
    })
    .filter((question): question is NormalizedQuestion => Boolean(question));
};

/** 从事件分片里取问题载荷并规范化；取不到问题时 questions 为空数组。 */
export const extractQuestionPayload = (
  chunk: unknown,
): { questions: NormalizedQuestion[]; source: string } => {
  const {
    questions: chunkQuestions,
    source: chunkSource,
    interrupt_info: interruptInfo,
  } = (chunk ?? {}) as PendingInterruptChunk;
  const rawQuestions = chunkQuestions || interruptInfo?.questions || [];
  const source = chunkSource || interruptInfo?.source || 'interrupt';
  const questions = normalizeQuestions(rawQuestions);

  return {
    questions,
    source,
  };
};

/**
 * 从事件分片里取工具审批载荷；action_requests 为空或与 review_configs
 * 数量不一致时视为畸形载荷，返回 null。
 */
export const extractToolApprovalPayload = (
  chunk: unknown,
): { actionRequests: ToolApprovalRequest[] } | null => {
  const { approval: chunkApproval, interrupt_info: interruptInfo } = (chunk ??
    {}) as PendingInterruptChunk;
  const approval: ToolApprovalPayloadFields =
    chunkApproval || interruptInfo?.approval || {};
  const actionRequests: ToolApprovalRequest[] = Array.isArray(
    approval.action_requests,
  )
    ? (approval.action_requests as ToolApprovalRequest[])
    : [];
  const reviewConfigs = Array.isArray(approval.review_configs)
    ? approval.review_configs
    : [];
  // action_requests 与 review_configs 一一对应，前端只消费 action_requests
  if (
    !actionRequests.length ||
    actionRequests.length !== reviewConfigs.length
  ) {
    return null;
  }
  return { actionRequests };
};

/** 从流事件分片里提取待处理中断：审批与提问两个分支，取不到有效载荷返回 null。 */
export const extractPendingInterrupt = (
  chunk: unknown,
  threadId: string,
): PendingInterrupt | null => {
  const {
    status,
    thread_id: chunkThreadId,
    run_id: runId,
  } = (chunk ?? {}) as PendingInterruptChunk;

  if (status === 'human_approval_required') {
    const approval = extractToolApprovalPayload(chunk);
    if (!approval) return null;
    return {
      kind: 'tool_approval',
      ...approval,
      status,
      threadId: chunkThreadId || threadId,
      interruptedRunId: runId || null,
    };
  }
  const payload = extractQuestionPayload(chunk);
  if (!payload.questions.length) return null;

  return {
    kind: 'question',
    questions: payload.questions,
    source: payload.source,
    status: status || '',
    threadId: chunkThreadId || threadId,
    interruptedRunId: runId || null,
  };
};
