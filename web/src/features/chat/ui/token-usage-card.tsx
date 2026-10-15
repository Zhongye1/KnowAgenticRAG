/**
 * 上下文用量卡片。
 *
 * 占比、构成条、当前对话累计与缓存命中率，展开后是「按模型分桶的调用统计 → 最近上下文
 * 构成 → 最近调用」三块。`token_usage` 缺失时显示「未上报」，不假装有数据。
 */
import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import {
  getCacheHitLabel,
  getLatestCallLabel,
  getModelUsageItems,
  getThreadTotalLabel,
  getTokenUsageAriaLabel,
  getTokenUsageBarSegments,
  getTokenUsageHeadLabel,
  getTokenUsagePercentLabel,
  getTokenUsageRatio,
  getTokenUsageSegments,
  getTokenUsageTone,
  type TokenUsage,
} from '../lib/token-usage';

type TokenUsageCardProps = {
  /** 线程 state 里的 `token_usage`；没有就是没上报。 */
  usage?: TokenUsage | null;
};

/** 占比档位的轨道着色。 */
const TONE_BARS: Record<'danger' | 'warning' | 'normal', string> = {
  danger:
    '[&::-webkit-progress-value]:bg-[var(--color-error-500)] [&::-moz-progress-bar]:bg-[var(--color-error-500)]',
  warning:
    '[&::-webkit-progress-value]:bg-[var(--color-warning-500)] [&::-moz-progress-bar]:bg-[var(--color-warning-500)]',
  normal:
    '[&::-webkit-progress-value]:bg-[var(--main-500)] [&::-moz-progress-bar]:bg-[var(--main-500)]',
};

/** 轨道本体（底槽）的样式；两套伪元素都要，否则 Firefox 会退回系统外观。 */
const PROGRESS_TRACK =
  'block h-[5px] w-full appearance-none overflow-hidden rounded-full bg-[var(--gray-100)] [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[var(--gray-100)] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:transition-[width,background-color] [&::-webkit-progress-value]:duration-200 [&::-moz-progress-bar]:rounded-full';

/** 构成分段与图例色点的着色。 */
const SEGMENT_TONES: Record<string, string> = {
  system: 'bg-[var(--chart-palette-2)]',
  tools: 'bg-[var(--chart-palette-3)]',
  messages: 'bg-[var(--chart-palette-1)]',
  'tool-messages': 'bg-[var(--chart-palette-6)]',
  summary: 'bg-[var(--chart-palette-5)]',
  cut: 'bg-[var(--main-500)] [background-image:repeating-linear-gradient(135deg,var(--main-30)_0,var(--main-30)_1px,transparent_1px,transparent_4px)]',
  overhead: 'bg-[var(--gray-300)]',
};

/** 认不出的分段用中性灰，不猜颜色。 */
const SEGMENT_TONE_FALLBACK = 'bg-[var(--gray-300)]';

const segmentTone = (key: string): string =>
  SEGMENT_TONES[key] ?? SEGMENT_TONE_FALLBACK;

export const TokenUsageCard = ({ usage }: TokenUsageCardProps) => {
  const [expanded, setExpanded] = React.useState(false);

  // 没有快照就整段不渲染：
  // 空卡片占着输入区上方又没有信息量
  if (!usage) return null;

  const ratio = getTokenUsageRatio(usage);
  const barSegments = getTokenUsageBarSegments(usage);
  const segments = getTokenUsageSegments(usage);
  const models = getModelUsageItems(usage);
  const threadTotal = getThreadTotalLabel(usage);
  const cacheHit = getCacheHitLabel(usage);
  const latestCall = getLatestCallLabel(usage);

  const tone = getTokenUsageTone(ratio);
  const percentLabel = getTokenUsagePercentLabel(ratio);
  const percentValue = ratio === null ? 0 : Math.round(ratio * 100);
  const hasDetails =
    segments.length > 0 || models.length > 0 || latestCall !== null;

  return (
    <section aria-label="上下文使用情况" data-testid="token-usage">
      {/* 整张卡就是开关：大号占比在左，标签与已用/上限在右 */}
      <button
        type="button"
        className="flex w-full flex-col gap-2 rounded-[10px] border border-[var(--gray-150)] bg-[var(--gray-0)] px-3 py-2.5 text-left transition-colors duration-200 hover:border-[var(--gray-200)]"
        aria-expanded={expanded}
        aria-controls="token-usage-details"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="flex items-baseline justify-between gap-2">
          <strong className="text-[18px] font-semibold leading-[1.1] tabular-nums text-[var(--gray-900)]">
            {percentLabel}
          </strong>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="whitespace-nowrap text-[11px] font-medium text-[var(--gray-500)]">
              上下文占用
            </span>
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] tabular-nums text-[var(--gray-500)]">
              {getTokenUsageHeadLabel(usage)}
            </span>
            <ChevronDown
              className={`size-3.5 shrink-0 text-[var(--gray-500)] transition-transform ${
                expanded ? '' : '-rotate-90'
              }`}
              aria-hidden
            />
          </span>
        </span>

        {/*
          用原生 progress 表达占比。上限未知时传 0 而不是省略 value：
          省略会渲染成浏览器的不确定态动画，静止的信息卡上容易被读成「正在加载」。
        */}
        <progress
          className={`${PROGRESS_TRACK} ${TONE_BARS[tone]}`}
          value={percentValue}
          max={100}
          aria-label="上下文占用"
          aria-valuetext={getTokenUsageAriaLabel(usage)}
          data-testid="token-usage-progress"
        />

        {/* 两项指标两列并排，中间一条分隔线 */}
        {threadTotal !== null || cacheHit !== null ? (
          <span className="grid grid-cols-2 gap-3 [&>*+*]:border-l [&>*+*]:border-[var(--gray-150)] [&>*+*]:pl-3">
            {threadTotal === null ? null : (
              <span className="flex min-w-0 flex-col">
                <small className="text-[11px] leading-[1.4] text-[var(--gray-500)]">
                  当前对话累计
                </small>
                <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold tabular-nums text-[var(--gray-900)]">
                  {threadTotal}
                </strong>
              </span>
            )}
            {cacheHit === null ? null : (
              <span className="flex min-w-0 flex-col">
                <small className="text-[11px] leading-[1.4] text-[var(--gray-500)]">
                  累计缓存命中率
                </small>
                <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold tabular-nums text-[var(--gray-900)]">
                  {cacheHit}
                </strong>
              </span>
            )}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div id="token-usage-details" className="flex flex-col gap-2.5 px-0.5">
          {/* 按模型分桶的调用统计：一整块卡片，条目之间用分隔线 */}
          {models.length > 0 ? (
            <div className="flex flex-col overflow-hidden rounded-[9px] border border-[var(--gray-150)]">
              {models.map((model) => (
                <article
                  key={model.key}
                  className="border-b border-[var(--gray-150)] bg-[var(--gray-0)] p-[11px] last:border-b-0"
                >
                  <header className="mb-2.5 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold leading-[1.4] text-[var(--gray-900)]">
                        {model.name}
                      </strong>
                      {model.responseModel ? (
                        <span className="text-[11px] text-[var(--gray-500)]">
                          响应 {model.responseModel}
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--gray-50)] px-1.5 py-0.5 text-[11px] text-[var(--gray-500)]">
                      {model.callCount} 次调用
                    </span>
                  </header>
                  <div
                    className={`grid gap-2 ${
                      model.reasoning ? 'grid-cols-3' : 'grid-cols-2'
                    }`}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[10px] text-[var(--gray-500)]">
                        输入 / 输出
                      </span>
                      <strong className="text-xs font-semibold tabular-nums text-[var(--gray-900)] [overflow-wrap:anywhere]">
                        {model.io}
                      </strong>
                    </span>
                    {model.cache ? (
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--gray-500)]">
                          缓存
                        </span>
                        <strong className="text-xs font-semibold tabular-nums text-[var(--gray-900)] [overflow-wrap:anywhere]">
                          {model.cache}
                        </strong>
                      </span>
                    ) : null}
                    {model.reasoning ? (
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--gray-500)]">
                          推理
                        </span>
                        <strong className="text-xs font-semibold tabular-nums text-[var(--gray-900)] [overflow-wrap:anywhere]">
                          {model.reasoning}
                        </strong>
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {/* 最近上下文构成：分段着色堆叠条 + 两列图例 */}
          {segments.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-[9px] border border-[var(--gray-150)] bg-[var(--gray-0)] p-[11px]">
              <span className="text-[11px] font-semibold text-[var(--gray-600)]">
                最近上下文构成
              </span>
              <span
                className="flex h-2.5 gap-px overflow-hidden rounded-full bg-[var(--gray-100)]"
                aria-hidden
              >
                {barSegments.map((segment) => (
                  <span
                    key={segment.key}
                    className={`block h-full min-w-[2px] transition-[width] duration-200 ${segmentTone(segment.key)}`}
                    style={{ width: segment.width }}
                  />
                ))}
              </span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {segments.map((segment) => (
                  <span
                    key={segment.key}
                    className="flex min-w-0 items-center justify-between gap-1.5 text-[11px] text-[var(--gray-500)]"
                  >
                    <span className="inline-flex min-w-0 items-center gap-[5px]">
                      <span
                        aria-hidden
                        className={`size-[7px] shrink-0 rounded-[2px] ${segmentTone(segment.key)}`}
                      />
                      {segment.label}
                    </span>
                    <strong className="font-semibold tabular-nums text-[var(--gray-800)]">
                      {segment.valueLabel}
                    </strong>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {latestCall ? (
            <div className="flex flex-col px-1">
              <span className="flex items-center justify-between gap-2.5 border-b border-[var(--gray-100)] py-[5px] text-[11px] text-[var(--gray-500)] last:border-b-0">
                最近调用
                <strong className="min-w-0 text-right font-semibold tabular-nums text-[var(--gray-800)]">
                  {latestCall}
                </strong>
              </span>
            </div>
          ) : null}

          {!hasDetails ? (
            <p className="text-[var(--gray-500)]">
              本次运行没有可展示的用量明细。
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
