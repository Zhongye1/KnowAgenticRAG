/** 生成中状态条的文案与计时。 */
export function buildReplyLoadingStatus(input: {
  replyLoadingVisible: boolean;
  contextCompressing: boolean;
  /** 队列是否暂停；暂停时队列条自己承载状态，状态条让位。 */
  queuePaused: boolean;
  queuedCount: number;
}): { visible: boolean; text: string } {
  if (!input.replyLoadingVisible || input.queuePaused) {
    return { visible: false, text: '' };
  }
  if (input.contextCompressing) {
    return { visible: true, text: '正在压缩上下文...' };
  }
  if (input.queuedCount > 0) {
    return {
      visible: true,
      text: `排队中（${input.queuedCount} 条）...`,
    };
  }
  return { visible: true, text: '正在生成回复...' };
}

/** 耗时标签；非正数返回空串。 */
export function buildElapsedLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}分${seconds % 60}s`;
}
