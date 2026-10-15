/**
 * 数据总览的展示格式化。
 *
 * 数字分组、存储容量（值与单位分开返回，因为指标卡的 label 要带单位）、Token 折算、
 * 完整时间与长标识截断。全部是纯函数，界面只消费结果。
 */

/** 千分位数字；`null`/`undefined`/不可解析值一律按 0。 */
export const formatNumber = (
  value: number | string | null | undefined,
): string => {
  const numeric = Number(value ?? 0);
  return (Number.isFinite(numeric) ? numeric : 0).toLocaleString('zh-CN');
};

const STORAGE_UNITS = [
  'B',
  'KB',
  'MB',
  'GB',
  'TB',
  'PB',
  'EB',
  'ZB',
  'YB',
] as const;

/**
 * 字节数 → 最多四位有效数字 + 单位；负数与不可解析值按 0。
 * 值和单位分开返回：指标卡把单位写进 label（`存储容量 (MB)`），不拼进数值里。
 */
export const formatStorageSize = (
  bytes: number | null | undefined,
): { value: string; unit: string } => {
  const numeric = Number(bytes ?? 0);
  let value = Number.isFinite(numeric) ? Math.max(numeric, 0) : 0;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < STORAGE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return {
    value: String(Number(value.toPrecision(4))),
    unit: STORAGE_UNITS[unitIndex],
  };
};

/** Token 数折算成 `M`：绝对值 ≥100 取整、≥10 一位小数、其余两位。 */
export const formatTokenValue = (value: number | null | undefined): string => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '0M';
  const millions = numeric / 1_000_000;
  const absolute = Math.abs(millions);
  const digits = absolute >= 100 ? 0 : absolute >= 10 ? 1 : 2;
  return `${millions.toFixed(digits)}M`;
};

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * 本地时间 `YYYY-MM-DD HH:mm:ss`。
 *
 * 后端同时给出带 `Z`（UTC）与不带时区（本地）的时间串，两种都交给 `Date` 按同一规则解释：
 * 无时区后缀按本地时间解析。
 */
export const formatFullDateTime = (
  value: string | null | undefined,
): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
};

/** 长标识截断成「前 start 位…后 end 位」；不超长时原样返回。 */
export const truncateIdentifier = (
  value: string | null | undefined,
  start = 8,
  end = 4,
): string => {
  const text = String(value ?? '');
  if (text.length <= start + end + 1) return text;
  return `${text.slice(0, start)}…${text.slice(-end)}`;
};
