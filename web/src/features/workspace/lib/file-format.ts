/** 个人空间表格里的取值格式化。 */
import { getPreviewFileExtension } from '@/shared/lib/files';

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

/** 大小：目录与无效值显示 `-`，0 显示 `0 B`。 */
export function formatFileSize(size: number, isDir: boolean): string {
  if (isDir) return '-';
  if (size === 0) return '0 B';
  if (!Number.isFinite(size) || size < 0) return '-';

  const index = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    SIZE_UNITS.length - 1,
  );

  return `${parseFloat((size / 1024 ** index).toFixed(2))} ${SIZE_UNITS[index]}`;
}

const MS_DAY = 24 * 60 * 60 * 1000;

type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';

/** dayjs `relativeTime` 的档位表（`plugin/relativeTime.js` 的 thresholds）。 */
const RELATIVE_THRESHOLDS: Array<{
  key: keyof typeof RELATIVE_LABELS;
  limit?: number;
  unit?: RelativeUnit;
}> = [
  { key: 's', limit: 44, unit: 'second' },
  { key: 'm', limit: 89 },
  { key: 'mm', limit: 44, unit: 'minute' },
  { key: 'h', limit: 89 },
  { key: 'hh', limit: 21, unit: 'hour' },
  { key: 'd', limit: 35 },
  { key: 'dd', limit: 25, unit: 'day' },
  { key: 'M', limit: 45 },
  { key: 'MM', limit: 10, unit: 'month' },
  { key: 'y', limit: 17 },
  { key: 'yy', unit: 'year' },
];

/** dayjs zh-cn 的相对时间串；`%d` 用四舍五入后的差值替换。 */
const RELATIVE_LABELS = {
  s: '几秒前',
  m: '1 分钟前',
  mm: '%d 分钟前',
  h: '1 小时前',
  hh: '%d 小时前',
  d: '1 天前',
  dd: '%d 天前',
  M: '1 个月前',
  MM: '%d 个月前',
  y: '1 年前',
  yy: '%d 年前',
};

/** 按日历加月份，日号超出目标月天数时收敛到月末（与 dayjs `add(months)` 同口径）。 */
const addMonths = (date: Date, months: number): Date => {
  const day = date.getDate();
  const shifted = new Date(date.getTime());
  shifted.setDate(1);
  shifted.setMonth(shifted.getMonth() + months);
  const lastDay = new Date(
    shifted.getFullYear(),
    shifted.getMonth() + 1,
    0,
  ).getDate();
  shifted.setDate(Math.min(day, lastDay));
  return shifted;
};

/** 两个时刻之间的月数，带小数（逐字照抄 dayjs 的 `monthDiff`）。 */
const monthDiff = (a: Date, b: Date): number => {
  if (a.getDate() < b.getDate()) return -monthDiff(b, a);

  const wholeMonths =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  const anchor = addMonths(a, wholeMonths);
  const before = b.getTime() - anchor.getTime() < 0;
  const anchor2 = addMonths(a, wholeMonths + (before ? -1 : 1));
  const span = before
    ? anchor.getTime() - anchor2.getTime()
    : anchor2.getTime() - anchor.getTime();

  return -(wholeMonths + (b.getTime() - anchor.getTime()) / span || 0);
};

/** 目标时刻比 `now` 早多少个 `unit`（正数表示早；未来时间夹到 0）。 */
const diffIn = (target: Date, now: Date, unit: RelativeUnit): number => {
  const diff = Math.max(0, now.getTime() - target.getTime());
  if (unit === 'month') return Math.max(0, monthDiff(now, target));
  if (unit === 'year') return Math.max(0, monthDiff(now, target)) / 12;
  if (unit === 'day') return diff / MS_DAY;
  if (unit === 'hour') return diff / (60 * 60 * 1000);
  if (unit === 'minute') return diff / (60 * 1000);

  return diff / 1000;
};

/**
 * 修改时间：相对当前时刻的中文文案。
 *
 * 逐档照抄 dayjs `fromNow()`（zh-cn）的算法：每档按它自己的单位取差、四舍五入后与上限比较，
 * 四舍五入到 0 或 1 时回退到上一档（这就是「1 分钟前 / 1 小时前 / 1 天前」的来源）。
 * 解析不出时间时显示 `-`；未来时间（时钟偏差或跨机器落盘）夹到「几秒前」，不带 dayjs 的
 * 「N 分钟后」那套串——文件表里出现未来时间属于异常，给一套更少的状态比多一套文案合理。
 */
export function formatRelativeTime(
  value: string,
  now: number = Date.now(),
): string {
  const time = Date.parse(String(value ?? ''));
  if (!Number.isFinite(time)) return '-';

  const current = new Date(now);
  const target = new Date(time);
  let diff = 0;

  for (let index = 0; index < RELATIVE_THRESHOLDS.length; index += 1) {
    const threshold = RELATIVE_THRESHOLDS[index] as {
      key: keyof typeof RELATIVE_LABELS;
      limit?: number;
      unit?: RelativeUnit;
    };
    if (threshold.unit) {
      diff = diffIn(target, current, threshold.unit);
    }

    const rounded = Math.round(Math.abs(diff));
    if (threshold.limit === undefined || rounded <= threshold.limit) {
      const effective =
        rounded <= 1 && index > 0
          ? (RELATIVE_THRESHOLDS[index - 1] as {
              key: keyof typeof RELATIVE_LABELS;
            })
          : threshold;

      return RELATIVE_LABELS[effective.key].replace('%d', String(rounded));
    }
  }

  return '-';
}

/**
 * 能不能编辑。
 *
 * 与后端 `EDITABLE_WORKSPACE_SUFFIXES` 同集：前端只是提前把编辑入口关掉，真正的拒绝仍在服务端。
 */
export function isEditableWorkspaceFile(path: unknown): boolean {
  return ['.md', '.markdown', '.mdx', '.txt'].includes(
    getPreviewFileExtension(path),
  );
}
