/** 智能体配置的读取与默认值。 */

/**
 * 配置值为 `null` 时表示「默认全部」的种类（后端语义：`null` 即启用当前用户可见的全部）。
 *
 * 这类种类不补默认值：`null` 本身就是一种取值，补上默认值会把它变成「只选默认那一项」。
 * 空数组另算，只有 `EMPTY_MEANS_ALL_RESOURCE_KINDS` 里的种类把 `[]` 也当「全部」。
 */
export const DEFAULT_ALL_RESOURCE_KINDS: readonly string[] = [
  'tools',
  'knowledges',
  'mcps',
  'skills',
  'subagents',
];

/**
 * 空数组也表示「默认全部」的种类。
 *
 * 后端把两组集合分开登记：`_DEFAULT_ALL_CONTEXT_FIELDS` 是 `tools / knowledges / mcps /
 * skills`，`_EMPTY_ALL_CONTEXT_FIELDS` 只有 `subagents`
 * （`backend/package/ars/agents/context.py`）。因此 `subagents: []` 与 `subagents: null`
 * 同义，而 `skills: []` 是一个都不选——字段描述里的「默认选择当前用户可用的全部」说的是 `null`。
 */
export const EMPTY_MEANS_ALL_RESOURCE_KINDS: readonly string[] = ['subagents'];

/** 只认普通对象；数组与 null 都不是配置，也不该被当成空对象吞掉。 */
export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/**
 * 把配置项的默认值补进智能体配置。
 *
 * 只补 `default`，不做类型转换：数字归一属于配置编辑页的职责，提及与模型选择都用不到。
 */
export function applyConfigDefaults(
  configurableItems: unknown,
  agentConfig: unknown,
): Record<string, unknown> {
  const items = asRecord(configurableItems);
  const config = { ...asRecord(agentConfig) };

  for (const [key, rawItem] of Object.entries(items)) {
    const item = asRecord(rawItem);
    const value = config[key];
    // `null` 表示「默认全部」的种类保留原值，其余情况下 null 与 undefined 都补默认值
    if (
      value === null &&
      DEFAULT_ALL_RESOURCE_KINDS.includes(asText(item.kind))
    )
      continue;
    if (value !== undefined && value !== null) continue;
    if (item.default !== undefined) config[key] = item.default;
  }

  return config;
}

/** 从 `GET /api/agent/{agent_id}` 的响应里取当前配置值（`config_json.context`）。 */
export function readAgentContext(agent: unknown): Record<string, unknown> {
  const configJson = asRecord(asRecord(agent).config_json);

  return asRecord(configJson.context ?? configJson);
}
