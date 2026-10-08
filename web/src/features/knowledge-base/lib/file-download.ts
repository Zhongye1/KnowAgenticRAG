/**
 * 触发浏览器下载。
 *
 * 上游在 `FileTable.vue` 里就地拼 `<a download>`；这里集中一处，便于在 jsdom 里用
 * 桩断言「blob 交给了浏览器、文件名取的是响应头里的那个」。
 */
export const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
