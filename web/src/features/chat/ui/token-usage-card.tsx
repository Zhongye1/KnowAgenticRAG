/**
 * 上下文用量卡片。
 *
 * 占比、构成条、当前对话累计与缓存命中率，展开后是按模型分桶的调用统计与最近一次调用。
 * `token_usage` 缺失时显示「未上报」，不假装有数据。
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

/** 占比档位对应原生进度条的颜色。 */
const TONE_ACCENTS: Record<'danger' | 'warning' | 'normal', string> = {
  danger: 'accent-danger-6',
  warning: 'accent-warning-6',
  normal: 'accent-primary-6',
};

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

  return (
    <section
      className="rounded-large border border-color-border-1 bg-color-bg-1 px-3 py-2 text-xs"
      data-testid="token-usage"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={expanded}
        aria-controls="token-usage-details"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="flex items-center gap-2">
          <strong className="text-sm text-color-text-1">
            上下文占用 {getTokenUsagePercentLabel(ratio)}
          </strong>
          <span className="text-color-text-3">
            {getTokenUsageHeadLabel(usage)}
          </span>
        </span>
        <ChevronDown
          className={`size-4 text-color-text-3 transition-transform ${expanded ? '' : '-rotate-90'}`}
          aria-hidden
        />
      </button>

      {/*
        用原生 progress 表达占比。上限未知时传 0 而不是省略 value：
        省略会渲染成浏览器的不确定态动画，静止的信息卡上容易被读成「正在加载」。
      */}
      <progress
        className={`mt-2 block h-1.5 w-full overflow-hidden rounded-full ${TONE_ACCENTS[getTokenUsageTone(ratio)]}`}
        value={ratio === null ? 0 : ratio * 100}
        max={100}
        aria-label="上下文占用"
        aria-valuetext={getTokenUsageAriaLabel(usage)}
        data-testid="token-usage-progress"
      />

      {threadTotal !== null || cacheHit !== null ? (
        <p className="mt-2 flex gap-4 text-color-text-3">
          {threadTotal === null ? null : (
            <span>
              当前对话累计{' '}
              <strong className="text-color-text-1">{threadTotal}</strong>
            </span>
          )}
          {cacheHit === null ? null : (
            <span>
              累计缓存命中率{' '}
              <strong className="text-color-text-1">{cacheHit}</strong>
            </span>
          )}
        </p>
      ) : null}

      {expanded ? (
        <div id="token-usage-details" className="mt-3 flex flex-col gap-3">
          {barSegments.length > 0 ? (
            <span
              className="flex h-1.5 w-full overflow-hidden rounded-full bg-color-fill-2"
              aria-hidden
            >
              {barSegments.map((segment) => (
                <span
                  key={segment.key}
                  className="block h-full bg-primary-6"
                  style={{ width: segment.width }}
                />
              ))}
            </span>
          ) : null}

          {segments.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {segments.map((segment) => (
                <li
                  key={segment.key}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-color-text-3">{segment.label}</span>
                  <span className="text-color-text-2">
                    {segment.valueLabel}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {models.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {models.map((model) => (
                <li
                  key={model.key}
                  className="rounded-medium border border-color-border-1 px-2 py-1"
                >
                  <p className="flex items-center justify-between gap-2">
                    <strong className="text-color-text-1">{model.name}</strong>
                    <span className="text-color-text-3">
                      {model.callCount} 次调用
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-3 text-color-text-3">
                    <span>
                      输入 / 输出{' '}
                      <strong className="text-color-text-1">{model.io}</strong>
                    </span>
                    {model.cache ? (
                      <span>
                        缓存{' '}
                        <strong className="text-color-text-1">
                          {model.cache}
                        </strong>
                      </span>
                    ) : null}
                    {model.reasoning ? (
                      <span>
                        推理{' '}
                        <strong className="text-color-text-1">
                          {model.reasoning}
                        </strong>
                      </span>
                    ) : null}
                  </p>
                  {model.responseModel ? (
                    <p className="mt-1 text-color-text-3">
                      响应 {model.responseModel}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {latestCall ? (
            <p className="flex items-center justify-between gap-2 text-color-text-3">
              <span>最近调用</span>
              <strong className="text-color-text-1">{latestCall}</strong>
            </p>
          ) : null}

          {segments.length === 0 && models.length === 0 && !latestCall ? (
            <p className="text-color-text-3">本次运行没有可展示的用量明细。</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
