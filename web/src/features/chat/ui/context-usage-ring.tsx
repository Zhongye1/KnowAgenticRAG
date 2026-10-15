/**
 * 上下文用量的环形指示器。
 *
 * 只负责把「已用 / 上限」画成一个环：比例、档位与文案都复用 `token-usage` 模块，
 * 不另造一套换算——那会让同一个百分比在卡片和环上算出不同结果。
 *
 * 上限未知时只画底环，不画进度弧：画一个 0% 的弧会让人以为「用量是 0」，
 * 而实际是「不知道上限」。
 */
import { Tooltip } from 'antd';

import {
  getTokenUsageRatio,
  getTokenUsageTone,
  getTokenUsageTooltipLabel,
} from '../lib/token-usage';
import type { TokenUsage } from '../lib/token-usage';

/** 环形半径与线宽；`viewBox` 是 16×16。 */
const RADIUS = 6;
const STROKE_WIDTH = 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 档位色：进度弧常态是主色，只有告警与危险才换色。 */
const TONE_CLASSES = {
  danger: 'text-[var(--color-error-500)]',
  warning: 'text-[var(--color-warning-500)]',
  normal: 'text-[var(--main-color)]',
} as const;

type ContextUsageRingProps = {
  usage: TokenUsage | null;
  disabled?: boolean;
  onClick?: () => void;
};

export const ContextUsageRing = ({
  usage,
  disabled = false,
  onClick,
}: ContextUsageRingProps) => {
  const ratio = usage ? getTokenUsageRatio(usage) : null;
  const tone = getTokenUsageTone(ratio);

  return (
    <Tooltip
      title={usage ? getTokenUsageTooltipLabel(usage) : null}
      placement="top"
      mouseEnterDelay={0.15}
    >
      <button
        type="button"
        className={`inline-flex size-[26px] shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent p-0 transition-colors enabled:hover:bg-[var(--gray-100)] disabled:cursor-not-allowed disabled:opacity-50 ${TONE_CLASSES[tone]}`}
        aria-label="上下文使用情况"
        disabled={disabled}
        onClick={onClick}
      >
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          className="block"
          aria-hidden
        >
          <circle
            cx="8"
            cy="8"
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            className="stroke-[var(--gray-300)] opacity-[0.65]"
          />
          {ratio !== null && ratio > 0 ? (
            <circle
              cx="8"
              cy="8"
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
              transform="rotate(-90 8 8)"
              className="stroke-current transition-[stroke-dashoffset] duration-300"
            />
          ) : null}
        </svg>
      </button>
    </Tooltip>
  );
};
