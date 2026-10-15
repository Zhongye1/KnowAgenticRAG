/**
 * 活跃度热力图用例。
 *
 * 周列切分、档位四等分、残月丢弃与列宽都是可被错改的判定：
 * 周起点错一天会让整列日期错位，档位用 floor 会让峰值日不满格。
 */
import { describe, expect, it } from 'vitest';

import {
  HEATMAP_CELL_GAP,
  HEATMAP_CELL_SIZE,
  buildHeatmap,
  buildHeatmapMonthSegments,
  buildHeatmapWeeks,
  heatmapLevel,
  normalizeHeatmapDays,
} from '@/features/dashboard/lib/heatmap';

/** 2026-10-05 是周一；用它做对齐起点，避免用例依赖机器时区以外的假设。 */
const monday = '2026-10-05';

const day = (date: string, active_users: number) => ({ date, active_users });

describe('档位', () => {
  it('按最大值四等分，峰值满格，0 与全零序列落 0 档', () => {
    // 变异：Math.ceil 改 Math.floor 会让 1/4 的值落 0 档
    expect(heatmapLevel(0, 8)).toBe(0);
    expect(heatmapLevel(1, 8)).toBe(1);
    expect(heatmapLevel(2, 8)).toBe(1);
    expect(heatmapLevel(3, 8)).toBe(2);
    expect(heatmapLevel(8, 8)).toBe(4);
    expect(heatmapLevel(5, 0)).toBe(0);
    expect(heatmapLevel(0, 0)).toBe(0);
  });
});

describe('日序列归一', () => {
  it('丢弃无日期的项，把计数收成数字', () => {
    // 变异：不过滤空日期会让 `new Date('T00:00:00')` 产生 NaN 并把首周对齐打乱
    expect(normalizeHeatmapDays([day('', 3), day(monday, 2)])).toEqual([
      day(monday, 2),
    ]);
    expect(normalizeHeatmapDays(undefined)).toEqual([]);
  });
});

describe('周列', () => {
  it('以周一为第一行，首周按星期补空位，末周补齐 7 行', () => {
    const weeks = buildHeatmapWeeks([day(monday, 1), day('2026-10-06', 0)], 1);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0][0]?.date).toBe(monday);
    expect(weeks[0][1]?.date).toBe('2026-10-06');
    expect(weeks[0].slice(2)).toEqual([null, null, null, null, null]);
  });

  it('周日落在第一列的最后一行', () => {
    // 变异：起点偏移写成 `getDay()` 会把周日排到第一行，整列错位
    const weeks = buildHeatmapWeeks([day('2026-10-11', 1)], 1);
    expect(weeks[0][6]?.date).toBe('2026-10-11');
    expect(weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
  });

  it('跨周切列：第二个周一是新的一列', () => {
    const weeks = buildHeatmapWeeks(
      [day(monday, 1), day('2026-10-06', 1), day('2026-10-12', 1)],
      1,
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[1][0]?.date).toBe('2026-10-12');
  });

  it('空序列不产生列', () => {
    expect(buildHeatmapWeeks([], 0)).toEqual([]);
  });
});

describe('月份分段', () => {
  it('同月连续周合并，跨度不足两周的残月丢弃', () => {
    // 4 周：10 月 3 周 + 11 月 1 周 → 11 月只有 1 列，丢弃
    // 变异：去掉 `span >= 2` 过滤会渲染出只有一个字母宽的「11月」
    const weeks = buildHeatmapWeeks(
      [
        day('2026-10-05', 1),
        day('2026-10-12', 1),
        day('2026-10-19', 1),
        day('2026-11-02', 1),
      ],
      1,
    );
    const months = buildHeatmapMonthSegments(weeks);
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({ label: '10月', start: 0, span: 3 });
  });
});

describe('视图', () => {
  it('列数、最小宽度与总量按周列与日序列推出', () => {
    const view = buildHeatmap([day(monday, 2), day('2026-10-06', 5)]);
    expect(view.columns).toBe(1);
    expect(view.minWidth).toBe(HEATMAP_CELL_SIZE);
    expect(view.minWidth).toBe(HEATMAP_CELL_SIZE * 1);
    expect(view.total).toBe(7);
    expect(view.max).toBe(5);
    expect(HEATMAP_CELL_GAP).toBe(3);
  });

  it('两周的最小宽度含列间距', () => {
    // 变异：minWidth 漏掉 `- GAP` 会让最后一列被裁掉
    const view = buildHeatmap([day(monday, 1), day('2026-10-12', 1)]);
    expect(view.columns).toBe(2);
    expect(view.minWidth).toBe(
      2 * (HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP) - HEATMAP_CELL_GAP,
    );
  });

  it('空序列的视图为空且宽度为 0', () => {
    const view = buildHeatmap([]);
    expect(view).toMatchObject({
      weeks: [],
      months: [],
      columns: 0,
      minWidth: 0,
      total: 0,
      max: 0,
    });
  });
});
