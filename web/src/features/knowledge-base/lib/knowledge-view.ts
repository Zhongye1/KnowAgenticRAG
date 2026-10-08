/**
 * 知识库展示用的小工具。
 *
 * 移植上游 `utils/kb_utils.js` 的类型标签，以及列表卡片与详情页共用的体积/数量格式化。
 * 上游的 `isReadOnlyDatabase`（连接器能力）等只读连接器的界面接进来再移植。
 */

/** 已知类型的展示名；未知类型原样显示。 */
export const getKbTypeLabel = (type?: string | null): string => {
  const normalized = String(type ?? '').toLowerCase();
  const labels: Record<string, string> = {
    milvus: 'ARS',
    dify: 'Dify',
    notion: 'Notion',
  };
  return labels[normalized] || String(type ?? '');
};

/** 与上游同口径的上海时区（固定 +08:00，上游用 dayjs 的 tz 插件；中国自 1991 年起无夏令时）。 */
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 解析后端时间戳，返回「读 UTC getter 即上海墙上时间」的 Date。
 *
 * 后端有 `2026-10-07T08:42:04.468047Z` 与 `str(datetime)` 的
 * `2026-10-07 08:42:04.468047+00:00` 两种形状，后者缺 `T` 会被部分引擎当本地时间解析，
 * 因此统一补 `T`，没有时区后缀的再按 UTC 解释。
 *
 * 只接受这两种字符串形状；上游还认时间戳数字，本仓当前没有这种来源，需要时再补。
 */
export const parseShanghai = (value?: string | null): Date | null => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const withT = text.includes('T') ? text : text.replace(' ', 'T');
  const normalized = /([zZ]|[+-]\d{2}:?\d{2})$/.test(withT)
    ? withT
    : `${withT}Z`;
  const time = Date.parse(normalized);
  if (Number.isNaN(time)) return null;
  return new Date(time + SHANGHAI_OFFSET_MS);
};

/** 字节数：按 1024 进制保留一位小数，空值显示 `—`。 */
export const formatBytes = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

/** 计数：超过一万折成 `1.2 万`，避免卡片被长数字撑开。 */
export const formatCount = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  if (value < 10000) return String(value);
  return `${(value / 10000).toFixed(1)} 万`;
};
