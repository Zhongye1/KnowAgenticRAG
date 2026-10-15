/**
 * 触发浏览器下载。
 *
 * 集中一处实现，便于在 jsdom 里用桩断言「blob 交给了浏览器、文件名取的是响应头里的那个」。
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
