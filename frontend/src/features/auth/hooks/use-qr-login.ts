import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createQrCode,
  pollQrStatus,
  type QrStatusPayload,
} from '../api/auth';

export type QrLoginPhase =
  | 'loading'
  | 'ready'
  | 'scanned'
  | 'expired'
  | 'confirmed'
  | 'error';

export type QrConfirmedToken = {
  access_token: string;
  refresh_token: string;
};

const POLL_INTERVAL = 2000;

/**
 * 扫码登录状态机（核心 Hook）。
 *
 * 状态流转：loading → ready → (scanned) → confirmed / expired
 * 任何时刻调用 refresh 都会回到 loading 重新拉取二维码。
 *
 * 约束（漏掉就是线上事故）：
 *  - confirmed / expired 后必须停止轮询，避免僵尸请求不停打接口
 *  - 组件卸载时必须清理定时器，防止内存泄漏
 */
export function useQrLogin(
  onConfirmed: (token: QrConfirmedToken) => void,
) {
  const [phase, setPhase] = useState<QrLoginPhase>('loading');
  const [qrImage, setQrImage] = useState('');
  const [error, setError] = useState<unknown>(null);
  const uuidRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const clearExpireTimer = useCallback(() => {
    if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    expireTimerRef.current = null;
  }, []);

  const refresh = useCallback(async () => {
    stopPolling();
    clearExpireTimer();
    setPhase('loading');
    setError(null);
    try {
      const { uuid, image, expire_seconds } = await createQrCode();
      uuidRef.current = uuid;
      setQrImage(image);
      setPhase('ready');

      // 二维码自带有效期，到期自动置为过期（后端轮询也会兜底）
      expireTimerRef.current = setTimeout(() => {
        setPhase((p) => (p === 'ready' || p === 'scanned' ? 'expired' : p));
      }, expire_seconds * 1000);

      timerRef.current = setInterval(async () => {
        try {
          const result = (await pollQrStatus(uuid)) as QrStatusPayload;
          if (result.status === 'scanned') setPhase('scanned');
          if (result.status === 'expired') {
            stopPolling();
            clearExpireTimer();
            setPhase('expired');
          }
          if (result.status === 'confirmed') {
            stopPolling();
            clearExpireTimer();
            setPhase('confirmed');
            onConfirmed({
              access_token: result.access_token!,
              refresh_token: result.refresh_token!,
            });
          }
        } catch {
          // 单次轮询失败静默重试，连续失败可升级为 error 态
        }
      }, POLL_INTERVAL);
    } catch (e) {
      setError(e);
      setPhase('error');
    }
  }, [onConfirmed, stopPolling, clearExpireTimer]);

  useEffect(() => {
    refresh();
    return () => {
      stopPolling();
      clearExpireTimer();
    };
  }, [refresh, stopPolling, clearExpireTimer]);

  return { phase, qrImage, error, refresh };
}
