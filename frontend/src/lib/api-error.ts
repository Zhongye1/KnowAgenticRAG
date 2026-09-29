import { isAxiosError } from 'axios';

/**
 * 错误文案提取：把任意后端错误体折叠成**可直接渲染的字符串**。
 *
 * 后端错误信封的 `msg` 现由 `exception_handler` 收口为字符串（结构化 detail 改走
 * `data`），但客户端不能假设对面一定是这个版本：仍可能遇到结构化的 `msg`
 * （历史/其它服务）、FastAPI 原生 `detail` 数组、网关直接回的 HTML 错误页。
 * 这些值一旦被当作 React 子节点渲染，就会抛 "Objects are not valid as a React child"，
 * 整棵组件树被 ErrorBoundary 兜底——表现为整个页面崩掉。
 * 因此所有面向用户的错误文案都必须经这里转换成字符串。
 */

const DEFAULT_FALLBACK = '请求失败，请稍后重试';

/** 单条文案上限，超出截断（避免把一整页响应体塞进提示）。 */
const MAX_MESSAGE_CHARS = 200;

/** 错误体最多下钻层数（envelope → msg → reason 这类嵌套）。 */
const MAX_DEPTH = 3;

/** 后端没给业务文案时的状态码兜底提示。 */
const STATUS_HINTS: Record<number, string> = {
  400: '请求参数有误',
  401: '登录状态已失效，请重新登录',
  403: '没有权限执行该操作',
  404: '请求的资源不存在或已被删除',
  409: '数据状态冲突，请刷新后重试',
  413: '文件体积超过服务端限制',
  415: '服务端不支持该文件格式',
  422: '文件或参数未通过服务端校验',
  429: '操作过于频繁，请稍后重试',
  500: '服务端异常，请稍后重试',
  502: '服务网关异常，请稍后重试',
  503: '服务暂时不可用，请稍后重试',
  504: '服务响应超时，请稍后重试',
};

/** 网关/代理的 HTML 错误页不是文案。 */
const looksLikeMarkup = (text: string) => /<\/?[a-z][\s\S]*>/i.test(text);

const truncate = (text: string) =>
  text.length > MAX_MESSAGE_CHARS
    ? `${text.slice(0, MAX_MESSAGE_CHARS)}…`
    : text;

/** 深度优先地把未知结构里的可读片段取出来；取不到返回 null。 */
const pickText = (value: unknown, depth = 0): string | null => {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || looksLikeMarkup(text)) return null;
    return truncate(text);
  }

  if (depth >= MAX_DEPTH) return null;

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => pickText(item, depth + 1))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? truncate(parts.join('；')) : null;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // 结构化配额/校验错误优先：reason（+ 纠正建议）
    const reason = pickText(record.reason, depth + 1);
    if (reason) {
      const suggestion = pickText(record.suggestion, depth + 1);
      return truncate(suggestion ? `${reason}（${suggestion}）` : reason);
    }
    return (
      pickText(record.msg, depth + 1) ??
      pickText(record.message, depth + 1) ??
      pickText(record.detail, depth + 1)
    );
  }

  return null;
};

/**
 * 取出可展示的错误文案，**返回值一定是字符串**。
 *
 * @param error 任意 catch 到的错误（axios 错误、普通 Error、未知值）
 * @param fallback 既没有业务文案也没有状态码提示时的兜底文案
 */
export const getApiErrorMessage = (
  error: unknown,
  fallback: string = DEFAULT_FALLBACK,
): string => {
  if (!isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  const fromBody = pickText(error.response?.data);
  if (fromBody) return fromBody;

  const status = error.response?.status;
  if (status && STATUS_HINTS[status]) return STATUS_HINTS[status];

  // 没有响应 = 请求根本没落地（服务不可用、被中断、CORS 拒签）
  return error.response ? fallback : '网络异常，请确认网络与服务可用后重试';
};
