/**
 * 消息底部工具条用的时间文案。
 *
 * 时区固定上海：后端给的是 ISO 串，界面按用户所在时区显示会让同一条消息在不同机器上
 * 显示不同的「昨天」。档位与参照一致：今天只给时间、昨天带前缀、一周内带星期、
 * 同年给月日、更早给日期。
 */
const TIME_ZONE = 'Asia/Shanghai';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 解析成 Date；解析不了返回 null。 */
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));

  return Number.isNaN(date.getTime()) ? null : date;
}

/** 上海日历下的日期键，形如 `2026-10-12`。 */
function dayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function timePart(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** 星期几，形如「周一」。 */
function weekdayPart(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    weekday: 'short',
  }).format(date);
}

function monthDayPart(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace('/', '-');
}

function yearPart(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
  }).format(date);
}

/** 完整的年月日，形如 `2026-10-12`。 */
function fullDatePart(date: Date): string {
  return dayKey(date);
}

/** 对话时间：今天 `HH:mm`、昨天 `昨天 HH:mm`、一周内 `周X HH:mm`、同年 `MM-DD HH:mm`、更早 `YYYY-MM-DD`。 */
export function formatChatTime(value: unknown, nowValue?: unknown): string {
  const date = toDate(value);
  if (!date) return '';

  const now = toDate(nowValue) ?? new Date();
  const time = timePart(date);

  if (dayKey(date) === dayKey(now)) return time;
  if (dayKey(date) === dayKey(new Date(now.getTime() - DAY_MS))) {
    return `昨天 ${time}`;
  }
  if (date.getTime() > now.getTime() - 7 * DAY_MS) {
    return `${weekdayPart(date)} ${time}`;
  }
  if (yearPart(date) === yearPart(now)) return `${monthDayPart(date)} ${time}`;

  return fullDatePart(date);
}

/** 耗时文案：不足一分钟给秒，超过给「N分M秒」；非正数返回空串。 */
export function formatDurationLabel(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '';

  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `耗时 ${seconds}s`;

  const minutes = Math.floor(seconds / 60);

  return `耗时 ${minutes}分${seconds % 60}s`;
}

/** 起止时间之差；任一缺失或未正数时返回 0。 */
export function messageDurationMs(
  startedAt: unknown,
  finishedAt: unknown,
): number {
  const started = toDate(startedAt);
  const finished = toDate(finishedAt);
  if (!started || !finished) return 0;

  const duration = finished.getTime() - started.getTime();

  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}
