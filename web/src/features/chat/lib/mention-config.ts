/** 提及候选的资源过滤。 */
import {
  applyConfigDefaults,
  asRecord,
  DEFAULT_ALL_RESOURCE_KINDS,
  EMPTY_MEANS_ALL_RESOURCE_KINDS,
} from './agent-config';

/** 可作为提及候选的配置种类。 */
export const MENTION_RESOURCE_KINDS = [
  'knowledges',
  'mcps',
  'skills',
  'subagents',
] as const;

export type MentionResourceKind = (typeof MENTION_RESOURCE_KINDS)[number];

const isMentionKind = (value: unknown): value is MentionResourceKind =>
  typeof value === 'string' &&
  (MENTION_RESOURCE_KINDS as readonly string[]).includes(value);

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const firstText = (
  source: Record<string, unknown>,
  fields: string[],
): string => {
  for (const field of fields) {
    const value = asText(source[field]);
    if (value) return value;
  }

  return '';
};

/** 可选项的标识。 */
const optionValue = (option: unknown): string => {
  if (typeof option === 'string') return option;
  if (typeof option !== 'object' || option === null) return '';

  return firstText(option as Record<string, unknown>, [
    'key',
    'id',
    'value',
    'name',
    'db_id',
    'slug',
    'label',
  ]);
};

/** 可选项的显示名。 */
const optionLabel = (option: unknown, fallback: string): string => {
  if (typeof option !== 'object' || option === null) return fallback;

  return (
    firstText(option as Record<string, unknown>, ['name', 'label']) || fallback
  );
};

const optionDescription = (option: unknown): string => {
  if (typeof option !== 'object' || option === null) return '';

  return asText((option as Record<string, unknown>).description);
};

/** 归一成 `lib/mention-resources.ts` 吃得下的形状；缺标识的条目返回 `null`。 */
function normalizeOption(
  kind: MentionResourceKind,
  option: unknown,
): Record<string, unknown> | null {
  const value = optionValue(option);
  if (!value) return null;

  const name = optionLabel(option, value);
  const description = optionDescription(option);

  if (kind === 'knowledges') {
    return { kb_id: value, name, description };
  }

  if (kind === 'subagents') {
    const raw =
      typeof option === 'object' && option !== null
        ? (option as Record<string, unknown>)
        : {};

    return { id: value, slug: asText(raw.slug) || value, name, description };
  }

  return { slug: value, name, description };
}

/** 配置项里这一项属于哪个提及种类；`kind` 优先，其次看配置键名。 */
const resolveKind = (
  key: string,
  item: Record<string, unknown>,
): MentionResourceKind | null => {
  if (isMentionKind(item.kind)) return item.kind;
  if (isMentionKind(key)) return key;

  return null;
};

export type MentionConfigInput = {
  /** `GET /api/agent/{agent_id}` 的 `configurable_items`。 */
  configurableItems?: unknown;
  /** 同一响应的 `config_json.context`。 */
  agentConfig?: unknown;
};

/** 四类候选都返回数组，缺省是空数组：调用方不必再判 `undefined`。 */
export type MentionConfigResult = {
  knowledgeBases: Array<Record<string, unknown>>;
  mcps: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
  subagents: Array<Record<string, unknown>>;
};

/**
 * 按智能体配置过滤出四类提及候选。
 *
 * 响应在契约里没有类型，字段按不可信数据处理：形状不符的配置项与可选项直接跳过，不猜。
 */
export function buildMentionConfig({
  configurableItems,
  agentConfig,
}: MentionConfigInput = {}): MentionConfigResult {
  const items = asRecord(configurableItems);
  const config = applyConfigDefaults(configurableItems, agentConfig);

  const includeAll: Record<string, boolean> = {};
  const selected: Record<string, Set<string>> = {};
  const options: Record<string, Map<string, Record<string, unknown>>> = {};

  // 第一遍：每个配置项按种类归位；选中值按配置键读，因此 `preload_skills` 的值也落进 skills
  for (const [key, rawItem] of Object.entries(items)) {
    const item = asRecord(rawItem);
    const kind = resolveKind(key, item);
    if (!kind) continue;

    const value = config[key];
    // `subagents` 的空数组与 `null` 同义，见 `EMPTY_MEANS_ALL_RESOURCE_KINDS`：这处按后端语义读
    const isEmptyAll =
      Array.isArray(value) &&
      value.length === 0 &&
      EMPTY_MEANS_ALL_RESOURCE_KINDS.includes(kind);

    if (
      (value === null || isEmptyAll) &&
      DEFAULT_ALL_RESOURCE_KINDS.includes(kind)
    ) {
      includeAll[kind] = true;
    } else if (Array.isArray(value)) {
      const bucket = (selected[kind] ??= new Set<string>());
      for (const entry of value) {
        const text = asText(entry);
        if (text) bucket.add(text);
      }
    }
  }

  // 第二遍：把可选项归一；同一进程里 kinds 的顺序由 MENTION_RESOURCE_KINDS 固定，不依赖对象键序
  for (const [key, rawItem] of Object.entries(items)) {
    const item = asRecord(rawItem);
    const kind = resolveKind(key, item);
    if (!kind) continue;
    if (!includeAll[kind] && !selected[kind]?.size) continue;

    const rawOptions = Array.isArray(item.options) ? item.options : [];
    for (const rawOption of rawOptions) {
      const value = optionValue(rawOption);
      if (!value) continue;
      if (!includeAll[kind] && !selected[kind]?.has(value)) continue;

      const normalized = normalizeOption(kind, rawOption);
      if (normalized) (options[kind] ??= new Map()).set(value, normalized);
    }
  }

  const pick = (kind: MentionResourceKind): Array<Record<string, unknown>> => {
    const bucket = options[kind];
    if (!bucket) return [];

    if (includeAll[kind]) return [...bucket.values()];

    const result: Array<Record<string, unknown>> = [];
    for (const value of selected[kind] ?? []) {
      const option = bucket.get(value);
      if (option) result.push(option);
    }

    return result;
  };

  return {
    knowledgeBases: pick('knowledges'),
    mcps: pick('mcps'),
    skills: pick('skills'),
    subagents: pick('subagents'),
  };
}
