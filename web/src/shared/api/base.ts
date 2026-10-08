/**
 * HTTP 基础设施：所有请求经这里发出。
 *
 * - `apiClient` 是生成物的实例（`src/apis/generated/client.gen.ts`），在这里完成配置：
 *   生成器把 baseUrl 默认成输入文件名，必须改回同源相对路径。
 * - `apiFetch` 服务手写层：表单编码的登录、流式响应等生成物不覆盖的场景。
 *
 * 鉴权只在 `Authorization` 头上传输（后端契约）。新后端没有 refresh 端点，
 * 因此 401 的处理是清除凭据并通知应用，不做重放。
 */
import { client } from './generated/client.gen';

export const TOKEN_STORAGE_KEY = 'ars_access_token';
export const UNAUTHORIZED_EVENT = 'ars:unauthorized';

export function getAccessToken(): string | null {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return;
  }
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * 从 `detail` 里取出可展示的文案。
 *
 * 后端有两种失败载荷：字符串 detail，以及带业务码的结构化对象（如队列的
 * 409 `{code, message}`）。后者若只落成通用文案，用户就看不到「为什么不行」。
 * `fetch` 自身抛出的 `TypeError` 是浏览器英文文案，不作为界面文案。
 */
function describeDetail(detail: unknown): string | null {
  if (typeof detail === 'string' && detail) return detail;
  // 客户端超时：给一句用户能据此行动的话，而不是通用失败文案
  if (detail instanceof Error && detail.name === 'TimeoutError') {
    return '请求超时，请重试。';
  }
  if (!detail || typeof detail !== 'object' || detail instanceof Error) {
    return null;
  }
  const { message, detail: nested } = detail as {
    message?: unknown;
    detail?: unknown;
  };
  if (typeof message === 'string' && message) return message;
  if (typeof nested === 'string' && nested) return nested;
  return null;
}

/** 后端错误响应统一为 `{ detail }`；网络与解析失败归到 status 0。 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, detail: unknown) {
    super(describeDetail(detail) ?? `请求失败（HTTP ${status}）`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** 把错误响应解析成 `ApiError`；未认证入口（如登录）复用它，避免各写一遍 detail 解析。 */
export async function toApiError(response: Response): Promise<ApiError> {
  let detail: unknown = null;
  try {
    const payload = (await response.json()) as { detail?: unknown };
    detail = payload?.detail ?? payload;
  } catch {
    detail = null;
  }
  return new ApiError(response.status, detail);
}

function notifyUnauthorized(response: Response): void {
  if (response.status !== 401) return;
  setAccessToken(null);
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

/** 手写层的请求入口：注入 Bearer、统一错误、401 副作用。 */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  if (!response.ok) {
    notifyUnauthorized(response);
    throw await toApiError(response);
  }
  return response;
}

// 生成物实例的配置：同源相对路径，鉴权与 401 处理统一在这里。
client.setConfig({ baseUrl: '' });

client.interceptors.request.use((request) => {
  const token = getAccessToken();
  if (token) request.headers.set('Authorization', `Bearer ${token}`);
  return request;
});

client.interceptors.response.use((response) => {
  notifyUnauthorized(response);
  return response;
});

export { client as apiClient };
