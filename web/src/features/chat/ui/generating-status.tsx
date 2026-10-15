/** 生成中状态条。 */
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
