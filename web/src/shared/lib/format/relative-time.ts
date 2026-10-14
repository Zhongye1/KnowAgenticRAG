/**
 * 相对时间文案；与参照同档：刚刚 / N分钟前 / N小时前 / N天前 / N个月前 / N年前。
 *
 * 时间无法解析时返回空串，由调用方决定显示什么。
 */
/** 后端值 → 文本；时间串之外一律按不可解析处理。 */
const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export function formatRelativeTime(value: unknown, now = Date.now()): string {
  const timestamp = Date.parse(asText(value));
  if (!Number.isFinite(timestamp)) return '';

  const elapsed = Math.max(0, now - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) return '刚刚';
  if (elapsed < hour) return `${Math.floor(elapsed / minute)}分钟前`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)}小时前`;
  if (elapsed < 30 * day) return `${Math.floor(elapsed / day)}天前`;
  if (elapsed < 365 * day) return `${Math.floor(elapsed / (30 * day))}个月前`;

  return `${Math.floor(elapsed / (365 * day))}年前`;
}
