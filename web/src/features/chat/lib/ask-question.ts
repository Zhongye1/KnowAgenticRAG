/**
 * 提问工具（`ask_user_question`）的解析。
 *
 * 参数与结果都可能是「一组问题」或「一个问题」，字段名还有多套别名（`question` /
 * `title` / `text`，`options` / `choices`，`allowOther` / `allow_other`…）。这里把
 * 归一、摘要与答案解析放在一起，渲染在 `ui/ask-question-result.tsx`。
 */
import type { ChatToolCall } from '../api/agent-api';

/** 「其他」选项的保留值。 */
export const OTHER_OPTION_VALUE = '__other__';

const QUESTION_WRAPPER_KEYS = ['questions', 'items', 'item', 'list', 'data'];
const OPTION_WRAPPER_KEYS = [
  'item',
  'items',
  'options',
  'list',
  'choices',
  'data',
];

export type QuestionOption = {
  label: string;
  value: string;
  description: string;
};

export type QuestionItem = {
  questionId: string;
  question: string;
  operation: string;
  multiSelect: boolean;
  options: QuestionOption[];
};

/** 布尔别名：真值串有 `true`/`1`/`yes`/`y`/`t`。 */
export function parseBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 't'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'f', ''].includes(normalized)) return false;
  }

  return fallback;
}

/** 字符串或 JSON 字符串先解析；解析不了按兜底值处理。 */
function parseJson(value: unknown, fallback: unknown): unknown {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * 从数组、包装键，或「对象本身就是一个条目」三种形状里取出集合。
 *
 * 第三种是必需的：调用方可能把单个问题对象直接传进来（`{question: '...'}`），
 * 这时没有任何包装键命中，但它本身就是一个条目。
 */
function resolveCollection(
  value: unknown,
  wrapperKeys: string[],
  isItem: (item: unknown) => boolean,
): unknown[] {
  const parsed = parseJson(value, null);
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];

  const record = parsed as Record<string, unknown>;
  for (const key of wrapperKeys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = resolveCollection(candidate, wrapperKeys, isItem);
      if (nested.length > 0) return nested;
    }
  }

  return isItem(parsed) ? [parsed] : [];
}

/** 选项归一；标签与值互相兜底，两者都没有的条目丢掉。 */
export function normalizeOptions(raw: unknown): QuestionOption[] {
  return resolveCollection(raw, OPTION_WRAPPER_KEYS, (item) =>
    Boolean((item as { label?: unknown })?.label),
  )
    .map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      const label = String(
        record.label ?? record.value ?? record.title ?? record.text ?? '',
      ).trim();
      const value = String(
        record.value ?? record.label ?? record.id ?? record.key ?? '',
      ).trim();
      if (!label && !value) return null;

      return {
        label: label || value,
        value: value || label,
        description: String(record.description ?? '').trim(),
      };
    })
    .filter((option): option is QuestionOption => option !== null);
}

/** 是否已经是「其他」选项；避免重复追加。 */
function isOtherOption(option: QuestionOption): boolean {
  const label = option.label.toLowerCase();
  const value = option.value.toLowerCase();

  return (
    value === OTHER_OPTION_VALUE ||
    value === 'other' ||
    label.includes('其他') ||
    label.includes('other')
  );
}

/**
 * 问题归一：接受「一组问题」或「一个问题」两种形状，字段名走别名，
 * `allowOther` 默认开、`multiSelect` 默认关，开了「其他」且还没有该选项时补一个。
 */
export function normalizeQuestions(raw: unknown): QuestionItem[] {
  return resolveCollection(raw, QUESTION_WRAPPER_KEYS, (item) => {
    const record = (item ?? {}) as Record<string, unknown>;

    return Boolean(record.question ?? record.title ?? record.text);
  })
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;

      const record = item as Record<string, unknown>;
      const question = String(
        record.question ?? record.title ?? record.text ?? '',
      ).trim();
      if (!question) return null;

      const questionId =
        String(
          record.questionId ?? record.question_id ?? record.id ?? '',
        ).trim() || `q-${index + 1}`;
      const allowOther = parseBool(
        record.allowOther ?? record.allow_other,
        true,
      );
      const multiSelect = parseBool(
        record.multiSelect ?? record.multi_select,
        false,
      );
      const baseOptions = normalizeOptions(
        record.options !== undefined ? record.options : record.choices,
      );
      const options =
        allowOther && !baseOptions.some(isOtherOption)
          ? [
              ...baseOptions,
              { label: '其他', value: OTHER_OPTION_VALUE, description: '' },
            ]
          : baseOptions;

      return {
        questionId,
        question,
        operation: String(record.operation ?? '').trim(),
        multiSelect,
        options,
      };
    })
    .filter((item): item is QuestionItem => item !== null);
}

/** 问题来自参数优先，其次结果；两处都没有时为空。 */
export function resolveQuestions(toolCall: ChatToolCall): QuestionItem[] {
  const fromArgs = normalizeQuestions(
    (toolCall.args ?? toolCall.function?.arguments) as unknown,
  );
  if (fromArgs.length > 0) return fromArgs;

  return normalizeQuestions(toolCall.tool_call_result?.content);
}

/** 头部摘要：首题截到 36 个字符；多题时补「等 N 题」，无题时「无问题」。 */
export function askQuestionSummary(questions: QuestionItem[]): string {
  if (questions.length === 0) return '无问题';

  const first = questions[0]!.question;
  const short = first.length > 36 ? `${first.slice(0, 36)}...` : first;

  return questions.length === 1 ? short : `${short} 等 ${questions.length} 题`;
}

/** 结果里的用户回答；`user_answer` 优先。 */
export function resolveUserAnswer(toolCall: ChatToolCall): unknown {
  const parsed = parseJson(toolCall.tool_call_result?.content, null) as Record<
    string,
    unknown
  > | null;
  if (!parsed || typeof parsed !== 'object') return null;

  return parsed.user_answer ?? parsed.answer ?? null;
}

/** 把选项值翻译成标签；找不到就原样返回。 */
function optionLabel(value: unknown, question: QuestionItem): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const option = question.options.find(
    (item) => item.value === raw || item.label === raw,
  );

  return option?.label ?? raw;
}

/** 单题答案：数组按顿号连接，`{type:'other'}` 拼「其他: 文本」，其余取标签。 */
export function formatAnswer(answer: unknown, question: QuestionItem): string {
  if (Array.isArray(answer)) {
    return answer
      .map((item) => optionLabel(item, question))
      .filter(Boolean)
      .join('、');
  }

  if (answer && typeof answer === 'object') {
    const record = answer as Record<string, unknown>;
    if (record.type === 'other') {
      const selected = Array.isArray(record.selected)
        ? record.selected
            .map((item) => optionLabel(item, question))
            .filter(Boolean)
        : [];
      const text = String(record.text ?? '').trim();

      return [...selected, text ? `其他: ${text}` : '其他'].join('、');
    }

    return JSON.stringify(answer);
  }

  return optionLabel(answer, question);
}

/** 取某一题的回答；单题时结果可以直接是标量。 */
export function questionAnswer(
  answer: unknown,
  questions: QuestionItem[],
  question: QuestionItem,
): unknown {
  if (answer === null || answer === undefined || answer === '')
    return undefined;

  if (
    questions.length === 1 &&
    (typeof answer !== 'object' || Array.isArray(answer))
  ) {
    return answer;
  }

  if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
    const record = answer as Record<string, unknown>;
    if (Object.hasOwn(record, question.questionId)) {
      return record[question.questionId];
    }
    if (questions.length === 1 && record.type === 'other') return answer;
  }

  return undefined;
}

/** 头部「已回答」摘要：逐题拼起来，超过 120 个字符截断。 */
export function answeredSummary(
  answer: unknown,
  questions: QuestionItem[],
): string {
  if (!answer) return '';

  const summaries = questions
    .map((question) => {
      const value = questionAnswer(answer, questions, question);

      return value === undefined ? '' : formatAnswer(value, question);
    })
    .filter(Boolean);

  const text =
    summaries.length > 0
      ? summaries.join(' | ')
      : formatAnswer(answer, questions[0]!);

  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}
