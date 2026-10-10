/**
 * 用户活跃度热力图的纯逻辑：日序列 → 周列 / 档位 / 月份分段 / 列宽。
 *
 * 「周一起始补空位」「档位按最大值四等分」「残月丢弃」都是可被错改的判定。
 * 输出只描述形状与档位，颜色由界面按 `--data-*` token 决定。
 */

/** 方格边长（px）与间距（px）；列宽由两者推出。 */
export const HEATMAP_CELL_SIZE = 16;
export const HEATMAP_CELL_GAP = 3;

/** 周标签列显示的星期；数组下标 0/1/2 对应周二/周四/周六的格子行。 */
export const HEATMAP_WEEKDAY_LABELS = ['一', '三', '五'] as const;

export type HeatmapDay = { date: string; active_users: number };

/** 把生成物的宽松日序列折成热力图输入；缺字段按 0，日期非字符串的条目丢弃。 */
export const toHeatmapDays = (days: unknown): HeatmapDay[] =>
  (Array.isArray(days) ? days : [])
    .map((day) => (day ?? {}) as Record<string, unknown>)
    .filter((day) => typeof day.date === 'string' && day.date)
    .map((day) => ({
      date: day.date as string,
      active_users: Number(day.active_users ?? 0) || 0,
    }));

export type HeatmapCell = {
  date: string;
  value: number;
  /** 0..4，4 最活跃。 */
  level: number;
};

export type HeatmapWeek = (HeatmapCell | null)[];

export type HeatmapMonthSegment = {
  key: string;
  label: string;
  /** 起始周列下标（0 基）。 */
  start: number;
  /** 占用的周列数。 */
  span: number;
};

export type HeatmapView = {
  weeks: HeatmapWeek[];
  months: HeatmapMonthSegment[];
  /** 周列数，界面用它写 `grid-template-columns`。 */
  columns: number;
  /** 内容最小宽度：列数不足时也要能横向滚动。 */
  minWidth: number;
  /** 全部日活跃用户数之和。 */
  total: number;
  max: number;
};

/** 单日档位：按最大值四等分，`max` 非正或当日非正时落 0 档。 */
export const heatmapLevel = (value: number, max: number): number => {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(4, Math.ceil((value / max) * 4));
};

/** 去掉缺日期的项，并把 `active_users` 收成数字。 */
export const normalizeHeatmapDays = (
  days: readonly HeatmapDay[] = [],
): HeatmapDay[] =>
  days
    .map((day) => ({
      date: String(day?.date ?? ''),
      value: Number(day?.active_users ?? 0),
    }))
    .filter((day) => day.date)
    .map((day) => ({
      date: day.date,
      active_users: Number.isFinite(day.value) ? day.value : 0,
    }));

const startOfWeekOffset = (date: string): number => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 0;
  // getDay()：周日 0 … 周六 6；热力图以周一为第一行。
  return (parsed.getDay() + 6) % 7;
};

/** 按自然周切列（周一起始），首周不足的位置补 `null`，末周补齐到 7 行。 */
export const buildHeatmapWeeks = (
  days: readonly HeatmapDay[] = [],
  max = 0,
): HeatmapWeek[] => {
  if (days.length === 0) return [];
  const cells: HeatmapCell[] = days.map((day) => ({
    date: day.date,
    value: day.active_users,
    level: heatmapLevel(day.active_users, max),
  }));
  const weeks: HeatmapWeek[] = [
    Array.from(
      { length: startOfWeekOffset(cells[0].date) },
      () => null,
    ) as HeatmapWeek,
  ];
  for (const cell of cells) {
    // 回到周一就另起一列；序列中间缺日也不会把两周挤进同一列。
    if (startOfWeekOffset(cell.date) === 0 && weeks.at(-1)?.length)
      weeks.push([]);
    weeks.at(-1)?.push(cell);
  }
  for (const week of weeks) {
    while (week.length < 7) week.push(null);
  }
  return weeks;
};

/** 月份分段：同月连续周合并；跨度不足两周的残月读不出月份标签，直接丢弃。 */
export const buildHeatmapMonthSegments = (
  weeks: readonly HeatmapWeek[] = [],
): HeatmapMonthSegment[] => {
  const segments: HeatmapMonthSegment[] = [];
  weeks.forEach((week, index) => {
    const firstCell = week.find((cell): cell is HeatmapCell => cell !== null);
    if (!firstCell) return;
    const month = Number(firstCell.date.slice(5, 7));
    if (!Number.isFinite(month)) return;
    const label = `${month}月`;
    const current = segments.at(-1);
    if (current?.label === label) {
      current.span += 1;
      return;
    }
    segments.push({ key: `${label}-${index}`, label, start: index, span: 1 });
  });
  return segments.filter((segment) => segment.span >= 2);
};

/** 热力图视图：周列、月份分段、列数与最小宽度、总量与峰值。 */
export const buildHeatmap = (days: readonly HeatmapDay[] = []): HeatmapView => {
  const normalized = normalizeHeatmapDays(days);
  const max = normalized.reduce(
    (peak, day) => Math.max(peak, day.active_users),
    0,
  );
  const weeks = buildHeatmapWeeks(normalized, max);

  return {
    weeks,
    months: buildHeatmapMonthSegments(weeks),
    columns: weeks.length,
    minWidth: Math.max(
      weeks.length * (HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP) - HEATMAP_CELL_GAP,
      0,
    ),
    total: normalized.reduce((sum, day) => sum + day.active_users, 0),
    max,
  };
};
