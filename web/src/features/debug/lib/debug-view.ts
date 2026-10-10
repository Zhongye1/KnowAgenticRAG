/**
 * 调试弹窗的纯逻辑：日志行解析与过滤、配置项归一、本地存储条目与导出。
 *
 * 本地存储的凭据键是 `ars_access_token`，其值不展示、不复制、不导出。
 * 配置项把 `_config_items` 的类型与说明并入条目，调用方不用自己去看那层元数据。
 */

/** 日志级别与展示顺序。 */
export const LOG_LEVELS = ['INFO', 'WARNING', 'ERROR', 'DEBUG'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number] | string;

export type DebugLogLine = {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  raw: string;
};

/**
 * 解析一行后端日志：`时间 - 级别 - 模块 - 消息`；不匹配的行按 INFO 处理并保留原文。
 */
export const parseLogLine = (line: string): DebugLogLine => {
  const match = line.match(
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:,\d{3})?)\s*-\s*(\w+)\s*-\s*([^-]+?)\s*-\s*(.+)$/,
  );
  if (match) {
    return {
      timestamp: match[1],
      level: match[2],
      module: match[3].trim(),
      message: match[4].trim(),
      raw: line,
    };
  }
  return { timestamp: '', level: 'INFO', module: '', message: line, raw: line };
};

/** 把日志文本切成行（丢掉空行）。 */
export const splitLogText = (text: string): string[] =>
  text.split('\n').filter((line) => line.trim().length > 0);

/**
 * 级别 + 关键词过滤。
 *
 * 级别比较用大写（后端偶发小写级别），关键词匹配整行原文。
 */
export const filterLogLines = (
  lines: DebugLogLine[],
  selectedLevels: readonly string[],
  search: string,
): DebugLogLine[] => {
  const levels = selectedLevels.map((level) => level.toUpperCase());
  const needle = search.trim().toLowerCase();
  return lines.filter((line) => {
    if (line.level && !levels.includes(String(line.level).toUpperCase())) {
      return false;
    }
    if (!needle) return true;
    return line.raw.toLowerCase().includes(needle);
  });
};

/** 日志级别对应的配色类（与本仓 tone 口径一致）。 */
export const logLevelClass = (level: LogLevel): string => {
  switch (String(level).toUpperCase()) {
    case 'ERROR':
      return 'text-danger-6';
    case 'WARNING':
      return 'text-warning-6';
    case 'DEBUG':
      return 'text-color-text-3';
    default:
      return 'text-primary-6';
  }
};

export type ConfigItem = {
  key: string;
  value: unknown;
  type: string;
  description: string;
};

/** 配置项归一：把 `_config_items` 里的类型与说明并进条目，其余键原样列出。 */
export const buildConfigItems = (
  config?: Record<string, unknown> | null,
): ConfigItem[] => {
  const source = config ?? {};
  const metadata = (source._config_items ?? {}) as Record<
    string,
    { type?: string; des?: string; description?: string }
  >;
  return Object.entries(source)
    .filter(([key]) => key !== '_config_items')
    .map(([key, value]) => {
      const meta = metadata[key] ?? {};
      return {
        key,
        value,
        type: meta.type ?? typeof value,
        description: meta.des ?? meta.description ?? '',
      };
    });
};

/** 配置项搜索：键、值与说明都参与。 */
export const filterConfigItems = (
  items: ConfigItem[],
  search: string,
): ConfigItem[] => {
  const needle = search.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    [item.key, formatConfigValue(item.value), item.description].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
};

/** 配置值转文本：对象用 JSON，null/undefined 显式写出来。 */
export const formatConfigValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/** 字节数转可读文本。 */
export const formatDebugBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * 凭据键：值不展示、不复制、不导出，只保留键与字节数用于排查存储占用。
 */
export const CREDENTIAL_STORAGE_KEY = 'ars_access_token';

/** 本仓的「系统键」前缀：调试时先看这些，其余是业务/第三方写入的。 */
export const SYSTEM_STORAGE_PREFIXES = [
  'ars_access_token',
  'ars',
  'theme',
  'vueuse',
  'loglevel',
] as const;

export type StorageItem = {
  key: string;
  /** 凭据条目的值恒为空串，见 `masked`。 */
  value: string;
  bytes: number;
  sizeText: string;
  preview: string;
  isSystem: boolean;
  /** 凭据：界面只显示「已隐藏」，复制与导出都跳过。 */
  masked: boolean;
};

/** 从 localStorage 读全部条目：系统键优先，其余按 key 排序。 */
export const readStorageItems = (
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
): StorageItem[] => {
  const items: StorageItem[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null) continue;
    const raw = storage.getItem(key) ?? '';
    const masked = key === CREDENTIAL_STORAGE_KEY;
    const bytes = new Blob([raw]).size;
    items.push({
      key,
      value: masked ? '' : raw,
      bytes,
      sizeText: formatDebugBytes(bytes),
      preview: masked
        ? '（凭据已隐藏）'
        : raw.length > 120
          ? `${raw.slice(0, 120)}...`
          : raw,
      isSystem: SYSTEM_STORAGE_PREFIXES.some((prefix) =>
        key.startsWith(prefix),
      ),
      masked,
    });
  }
  return items.sort((left, right) => {
    if (left.isSystem !== right.isSystem) return left.isSystem ? -1 : 1;
    return left.key.localeCompare(right.key);
  });
};

/** 本地存储搜索：键与值都参与。 */
export const filterStorageItems = (
  items: StorageItem[],
  search: string,
): StorageItem[] => {
  const needle = search.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.key.toLowerCase().includes(needle) ||
      item.value.toLowerCase().includes(needle),
  );
};

export const totalStorageBytes = (items: StorageItem[]): number =>
  items.reduce((sum, item) => sum + item.bytes, 0);

/** 导出 JSON：键值对，凭据条目直接跳过（导出物会落到剪贴板或文件里）。 */
export const buildStorageExport = (
  items: StorageItem[],
): { payload: Record<string, string>; json: string } => {
  const payload: Record<string, string> = {};
  for (const item of items) {
    if (item.masked) continue;
    payload[item.key] = item.value;
  }
  return { payload, json: JSON.stringify(payload, null, 2) };
};

/** 日志文件名：`ars-api-log-YYYYMMDD_HHmmss.log`。 */
export const buildLogFileName = (now = new Date()): string => {
  const two = (value: number) => String(value).padStart(2, '0');
  return `ars-api-log-${now.getFullYear()}${two(now.getMonth() + 1)}${two(
    now.getDate(),
  )}_${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}.log`;
};
