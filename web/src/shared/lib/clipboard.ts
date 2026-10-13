/**
 * 复制文本到剪贴板。
 *
 * 只走异步剪贴板 API。参照实现在它不可用时降级到已废弃的 `document.execCommand('copy')`，
 * 本仓不搬这条降级：非安全上下文拿不到剪贴板是环境限制，用废弃 API 假装成功会让
 * 「已复制」的反馈失真。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
