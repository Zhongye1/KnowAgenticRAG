import { useCallback, useEffect, useState } from 'react';

/**
 * 秒级倒计时，用于「发送验证码」按钮冷却，避免连点把 SMTP 打爆。
 *
 * `start(60)` 起跳，每秒递减到 0 自动停；组件卸载时清掉定时器。
 */
export const useCountdown = () => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;

    const timer = window.setTimeout(() => {
      setSeconds((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [seconds]);

  const start = useCallback((value: number) => setSeconds(value), []);

  return { seconds, running: seconds > 0, start };
};
