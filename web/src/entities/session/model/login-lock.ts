/**
 * 423 锁定倒计时。
 *
 * 与 KnowAgenticRAG `LoginView.vue` 的 `startLockCountdown` 同语义：拿到剩余秒数就每秒递减，
 * 归零自动解锁；再次提交或卸载时清掉定时器。
 */
import * as React from 'react';

import { formatLockRemaining } from '../lib/login-lock';

/** 倒计时步长，与 KnowAgenticRAG 的 `setInterval(..., 1000)` 同值。 */
export const LOCK_TICK_MS = 1000;

export type LoginLock = {
  locked: boolean;
  remainingSeconds: number;
  /** 锁定期间按钮上的文案，例如「账户已锁定 4分59秒」。 */
  lockedLabel: string;
  /** 仅在拿到正数剩余秒数时进入锁定；否则只显示后端文案。 */
  start: (seconds: number) => void;
  clear: () => void;
};

export function useLoginLock(): LoginLock {
  const [remainingSeconds, setRemainingSeconds] = React.useState(0);
  const locked = remainingSeconds > 0;

  React.useEffect(() => {
    if (!locked) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, LOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, [locked]);

  const start = React.useCallback((seconds: number) => {
    if (seconds > 0) setRemainingSeconds(seconds);
  }, []);

  const clear = React.useCallback(() => {
    setRemainingSeconds(0);
  }, []);

  return {
    locked,
    remainingSeconds,
    lockedLabel: `账户已锁定 ${formatLockRemaining(remainingSeconds)}`,
    start,
    clear,
  };
}
