/**
 * 浏览器侧的下载动作。个人空间、对话目录与交付物下载都要用，两个切片共用这一处。
 */

/**
 * 从 Content-Disposition 里解出下载文件名。
 *
 * 优先 RFC 5987 的 `filename*=UTF-8''…`（中文文件名），ASCII 的 `filename="…"` 兜底；都解析不出
 * 时返回空串，由调用方退回条目自身的名字。
 */
export function parseDownloadFilename(contentDisposition: unknown): string {
  const header = String(contentDisposition ?? '');
  if (!header) return '';

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // 编码坏了就退到 ASCII 分支
    }
  }

  const asciiMatch = header.match(/filename="?([^";]+)"?/i);

  return asciiMatch?.[1] ?? '';
}

/**
 * 用浏览器下载一个 blob，并立即回收临时对象 URL。
 *
 * 返回是否真的触发了下载；环境不支持时为 false，调用方按失败提示。
 */
export function saveBlobAsFile(input: {
  blob: Blob;
  filename: string;
}): boolean {
  if (typeof document === 'undefined' || !window.URL?.createObjectURL)
    return false;

  const url = window.URL.createObjectURL(input.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = input.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);

  return true;
}
