/**
 * 图谱详情面板的纯逻辑：属性筛选、取值渲染与「竖排/截断」判定。
 *
 * 竖排阈值 50、截断 100、切换元素时重置展开态。
 * 非原始值（对象/数组）用 JSON 渲染，否则属性面板看不出内容。
 */

/** 超过这个长度就改成标签在上、值在下的竖排。 */
export const STACK_THRESHOLD = 50;

/** 超过这个长度就截断，给「展开 / 收起」。 */
export const TRUNCATE_LIMIT = 100;

/** 边属性里不展示的键（端点信息已在图上，`truncate` 是渲染残留）。 */
const HIDDEN_EDGE_KEYS = new Set(['source_id', 'target_id', '_id', 'truncate']);

/** 边属性：过滤掉内部键，其余保持后端给的顺序。 */
export const visibleEdgeProperties = (
  properties?: Record<string, unknown> | null,
): Array<[string, unknown]> =>
  Object.entries(properties ?? {}).filter(
    ([key]) => !HIDDEN_EDGE_KEYS.has(key),
  );

/**
 * 取值渲染成一行文本。
 *
 * 原始值 `String(value)`；对象与数组用 JSON；
 * `null`/`undefined` 与空字符串都渲染成 `-`，避免出现空白行看不出是空值。
 */
export const formatGraphValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value === '' ? '-' : value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? '-';
  } catch {
    return String(value);
  }
};

/** 值是否需要竖排（长文本一行放不下）。 */
export const isStackedValue = (value: unknown): boolean =>
  typeof value === 'string' && value.length > STACK_THRESHOLD;

/** 值是否被截断过。 */
export const isTruncatable = (text: string): boolean =>
  text.length > TRUNCATE_LIMIT;

/** 按展开态给出这一行要显示的文本。 */
export const displayValue = (text: string, expanded: boolean): string =>
  expanded || !isTruncatable(text)
    ? text
    : `${text.slice(0, TRUNCATE_LIMIT)}...`;
