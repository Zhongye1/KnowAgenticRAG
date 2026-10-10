/**
 * 用户活跃度热力图（自绘方格，不用图表库）。
 *
 * 形状计算在 `lib/heatmap.ts`，这里只把周列、月份分段与档位渲染成 DOM：
 * 每格一个 `title`/`aria-label`，键盘与读屏都能读到日期与活跃人数。
 * 颜色只用 `--data-1` 与中性 token 的透明度层级，亮暗都成立。
 */
import {
  HEATMAP_WEEKDAY_LABELS,
  buildHeatmap,
  type HeatmapDay,
} from '../lib/heatmap';
import { cn } from '@/shared/lib';

/** 档位 → 方格底色；0 档是空槽，1..4 逐级加深。 */
const LEVEL_CLASSES = [
  'bg-color-fill-2',
  'bg-data-1/20',
  'bg-data-1/40',
  'bg-data-1/65',
  'bg-data-1',
] as const;

export const ActivityHeatmap = ({
  days,
  loading = false,
}: {
  days: readonly HeatmapDay[] | undefined;
  loading?: boolean;
}) => {
  if (loading) {
    return (
      <div
        data-testid="activity-heatmap-loading"
        aria-busy="true"
        aria-label="正在加载活跃度"
        className="grid grid-cols-[repeat(18,16px)] justify-between gap-y-[3px] pt-0.5"
      >
        {Array.from({ length: 126 }, (_, index) => (
          <span
            key={index}
            className="size-4 animate-pulse rounded-small bg-color-fill-2"
          />
        ))}
      </div>
    );
  }

  const view = buildHeatmap(days ?? []);
  if (view.weeks.length === 0) {
    return (
      <p
        data-testid="activity-heatmap-empty"
        className="grid min-h-[88px] place-items-center text-xs text-color-text-3"
      >
        暂无活跃记录。
      </p>
    );
  }

  const gridStyle = {
    gridTemplateColumns: `repeat(${view.columns}, 16px)`,
    minWidth: `${view.minWidth}px`,
  } as const;

  return (
    <div className="w-full min-w-0" data-testid="activity-heatmap">
      <div className="flex min-w-0 gap-1.5">
        <div
          aria-hidden
          className="grid w-[22px] flex-[0_0_22px] grid-rows-[18px_repeat(7,16px)] gap-[3px] text-[10px] leading-[10px] text-color-text-3"
        >
          {HEATMAP_WEEKDAY_LABELS.map((label, index) => (
            <span key={label} style={{ gridRow: (index + 1) * 2 }}>
              {label}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div
            aria-hidden
            className="grid h-[18px] w-full justify-between text-[10px] text-color-text-3"
            style={gridStyle}
          >
            {view.months.map((month) => (
              <span
                key={month.key}
                className="min-w-0 whitespace-nowrap"
                style={{
                  gridColumn: `${month.start + 1} / span ${month.span}`,
                }}
              >
                {month.label}
              </span>
            ))}
          </div>
          <div
            role="grid"
            aria-label="近 120 天用户活跃度"
            className="grid w-full justify-between"
            style={gridStyle}
          >
            {view.weeks.map((week, weekIndex) => (
              <div
                key={weekIndex}
                // 方格是 CSS grid 布局，没有可换的 table 结构；role 负责表达 2D 网格语义
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- CSS grid 日历没有等价表格标签
                role="row"
                className="grid grid-rows-[repeat(7,16px)] gap-[3px]"
              >
                {week.map((cell, cellIndex) =>
                  cell ? (
                    <span
                      key={cell.date}
                      // 同上：单格语义由 CSS grid 承载
                      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- CSS grid 日历没有等价表格标签
                      role="gridcell"
                      className={cn(
                        'size-4 rounded-small',
                        LEVEL_CLASSES[cell.level],
                      )}
                      title={`${cell.date}：${cell.value} 位活跃用户`}
                      aria-label={`${cell.date}，${cell.value} 位活跃用户`}
                    />
                  ) : (
                    <span
                      key={`empty-${weekIndex}-${cellIndex}`}
                      className="size-4"
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex w-full items-center gap-1 text-[10px] text-color-text-3">
        <span>少</span>
        {LEVEL_CLASSES.map((className, index) => (
          <span key={index} className={cn('size-3 rounded-small', className)} />
        ))}
        <span>多</span>
        <span
          className="ml-auto tabular-nums whitespace-nowrap"
          data-testid="activity-heatmap-total"
        >
          {view.total} 次活跃记录
        </span>
      </div>
    </div>
  );
};
