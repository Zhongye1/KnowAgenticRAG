/**
 * 生成中状态条。
 *
 * 对齐参照的 `generating-status`：文案随状态变化（压缩上下文 / 排队中 / 正在生成），
 * 并带流逝时间；圆点与呼吸动画同参照 `.loading-dots` / `.generating-text`。
 * 纯展示，状态判定在 `buildReplyLoadingStatus`。
 */
import { buildElapsedLabel } from '../lib/reply-status';
import styles from './panel-sections.module.css';

export type GeneratingStatusProps = {
  text: string;
  /** 状态条出现时计时器记录的秒数。 */
  elapsedSeconds: number;
};

export const GeneratingStatus = ({
  text,
  elapsedSeconds,
}: GeneratingStatusProps) => {
  const elapsedLabel = buildElapsedLabel(elapsedSeconds);
  return (
    <div
      role="status"
      aria-live="polite"
      className={styles.generating}
      data-testid="generating-status"
    >
      <span className={styles.generatingDots} aria-hidden>
        <span className={styles.generatingDot} />
        <span className={`${styles.generatingDot} ${styles.generatingDot2}`} />
        <span className={`${styles.generatingDot} ${styles.generatingDot3}`} />
      </span>
      <span className={styles.generatingText}>{text}</span>
      {elapsedLabel ? (
        <span className={styles.generatingElapsed}>{elapsedLabel}</span>
      ) : null}
    </div>
  );
};
