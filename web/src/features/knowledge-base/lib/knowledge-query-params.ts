/**
 * 查询参数与查询测试的参数组装。
 *
 * 后端按知识库类型下发可配置项（`GET /query-params` 的 `params.options`），界面只改这些键，
 * 其余丢弃；`include_distances` 不是用户可改项，但检索测试需要它，因此固定为 `true` 一起提交。
 */

/** 下拉项。 */
export type QueryParamChoice = {
  value: string;
  label?: string | null;
  description?: string | null;
};

/** 一个可配置的查询参数。 */
export type QueryParamOption = {
  key: string;
  label?: string | null;
  type?: string | null;
  default?: unknown;
  options?: QueryParamChoice[] | null;
  min?: number | null;
  max?: number | null;
  description?: string | null;
};

export type KnowledgeQueryParams = {
  type?: string | null;
  options: QueryParamOption[];
};

/** 序列化里不暴露给用户的键。 */
const HIDDEN_KEYS = new Set(['include_distances']);

/** 按参数类型归一值：布尔要真布尔，数值要真数值，其余按原样。 */
export const coerceQueryParamValue = (
  option: QueryParamOption,
  value: unknown,
): unknown => {
  if (option.type === 'boolean') return Boolean(value);
  if (option.type === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  return value;
};

/**
 * 组装检索测试/保存用的参数对象。
 *
 * 规则：只保留后端下发的键；已有值优先，缺的用 `default`；`default` 也没有就不带这个键。
 */
export const buildQueryMeta = (
  params: KnowledgeQueryParams,
  stored: Record<string, unknown> = {},
): Record<string, unknown> => {
  const meta: Record<string, unknown> = {};
  for (const option of params.options ?? []) {
    if (HIDDEN_KEYS.has(option.key)) continue;
    const value =
      stored[option.key] !== undefined ? stored[option.key] : option.default;
    if (value === undefined || value === null) continue;
    meta[option.key] = coerceQueryParamValue(option, value);
  }
  // 检索测试要看到距离/相似度，界面上不做开关
  meta.include_distances = true;
  return meta;
};
