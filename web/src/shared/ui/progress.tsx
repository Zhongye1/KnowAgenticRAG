/**
 * 进度条。
 *
 * 上游用 `a-progress`（图谱构建、数据集生成、评估运行三处）。这里只保留用得到的形态：
 * 百分比 + 可选文案，颜色走语义 Token，`role="progressbar"` 带上数值给辅助技术。
 */
import { cn } from '@/shared/lib';

type ProgressProps = {
  /** 0..100；越界会夹取，非数字按 0 处理。 */
  value: number | null | undefined;
  label?: string;
  className?: string;
  tone?: 'primary' | 'success';
};

const TONE_CLASSES = {
  primary: 'bg-primary-6',
  success: 'bg-success-6',
} as const;

export const Progress = ({
  value,
  label,
  className,
  tone = 'primary',
}: ProgressProps) => {
  const numeric = Number(value);
  const percent = Number.isFinite(numeric)
    ? Math.min(100, Math.max(0, Math.round(numeric)))
    : 0;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label ? (
        <span className="text-xs text-color-text-3">{label}</span>
      ) : null}
      <div
        role="progressbar"
        aria-label={label ?? '进度'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-full bg-color-fill-2"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            TONE_CLASSES[tone],
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
