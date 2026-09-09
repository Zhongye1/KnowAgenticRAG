type ApiErrorLike = {
  response?: { data?: { msg?: string; message?: string } };
  message?: string;
};

/**
 * 从后端统一响应结构（{ code, msg, data }）或 axios 错误中提取可展示的错误信息。
 */
export const getErrorMessage = (
  error: unknown,
  fallback = '操作失败，请稍后重试',
): string => {
  if (error && typeof error === 'object') {
    const e = error as ApiErrorLike;
    const msg = e.response?.data?.msg ?? e.response?.data?.message;
    if (msg) return msg;
    if (e.message) return e.message;
  }
  return fallback;
};
