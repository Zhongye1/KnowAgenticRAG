/**
 * 上下文用量的环形指示器。
 *
 * 只负责把「已用 / 上限」画成一个环：比例、档位与文案都复用 `token-usage` 模块，
 * 不另造一套换算——那会让同一个百分比在卡片和环上算出不同结果。
 *
 * 上限未知时只画底环，不画进度弧：画一个 0% 的弧会让人以为「用量是 0」，
 * 而实际是「不知道上限」。
 */
import { getTokenUsagePercentLabel, getTokenUsageRatio, getTokenUsageTone } from '../lib/token-usage';
import type { TokenUsage } from '../lib/token-usage';

/** 环形半径与线宽；`viewBox` 是 16×16。 */
const RADIUS = 6;
const STROKE_WIDTH = 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TONE_CLASSES = {
  danger: 'text-[var(--color-error-500)]',
  warning: 'text-[var(--second-600)]',
  normal: 'text-[var(--main-600)]',
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
  const percentLabel = getTokenUsagePercentLabel(ratio);
  const title = `上下文占用 ${percentLabel}`;

  return (
    <button
      type="button"
      className={`shrink-0 rounded-full p-0.5 ${TONE_CLASSES[tone]}`}
      title={title}
      aria-label="上下文使用情况"
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <circle
          cx="8"
          cy="8"
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          className="stroke-[var(--gray-150)]"
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
            className="stroke-current"
          />
        ) : null}
      </svg>
    </button>
  );
};
