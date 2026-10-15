/** 登录锁定（HTTP 423）的纯逻辑：剩余秒数解析与中文时长格式化。 */

/** 锁定提示文案里的剩余秒数，例如「请等待 300 秒后再试」。 */
const REMAINING_SECONDS_RE = /(\d+)\s*秒/;

/** 从后端 detail 文案里兜底解析剩余秒数；解析不到返回 0，调用方据此只显示文案不启动倒计时。 */
export function parseRemainingSecondsFromDetail(detail: unknown): number {
  if (typeof detail !== 'string') return 0;
  const matched = REMAINING_SECONDS_RE.exec(detail);
  if (!matched) return 0;
  const seconds = Number.parseInt(matched[1], 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/** 剩余秒数的中文时长：不足一分钟按秒，随后依次进位到分秒、时分、天时。 */
export function formatLockRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分钟`;
  }
  return `${Math.floor(seconds / 86400)}天${Math.floor((seconds % 86400) / 3600)}小时`;
}
