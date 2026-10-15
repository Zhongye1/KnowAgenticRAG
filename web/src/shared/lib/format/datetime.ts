/**
 * 时间戳的展示格式化。
 *
 * 设置面板里的「最后使用 / 过期时间 / 最后登录」都是同一口径的分钟级时间戳，只有这一处。
 * 按浏览器本地时区解析（后端给的是带 `Z` 的 UTC 串）；空值与不可解析值一律给 `-`。
 */

const pad = (value: number): string => String(value).padStart(2, '0');

/** 本地时间的 `YYYY-MM-DD HH:mm`；空值与不可解析值给 `-`。 */
export const formatMinuteStamp = (value: string | null | undefined): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';

  return (
    `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ` +
    `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  );
};
