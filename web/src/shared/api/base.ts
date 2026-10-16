/**
 * HTTP 基础设施：所有请求经这里发出。
 *
 * - `apiClient` 是生成物的实例（`src/shared/api/generated/client.gen.ts`），在这里完成配置：
 *   生成器把 baseUrl 默认成输入文件名，必须改回同源相对路径。
 * - `apiFetch` 服务手写层：表单编码的登录、流式响应等生成物不覆盖的场景。
 * - 生成客户端的默认超时与错误折叠也在这里装配：生成物用 `throwOnError` 抛出的是响应体，
 *   不折成 `ApiError` 的话，各调用点的错误文案会集体退化成兜底文案。
 *
 * 鉴权只在 `Authorization` 头上传输（后端契约）。新后端没有 refresh 端点，
 * 因此 401 的处理是清除凭据并通知应用，不做重放。
 */
import { client } from './generated/client.gen';

export const TOKEN_STORAGE_KEY = 'ars_access_token';
export const UNAUTHORIZED_EVENT = 'ars:unauthorized';

/**
 * 生成客户端的默认请求超时。
 *
 * 生成 client 没有 timeout 配置项，只能从请求拦截器注入。取值偏宽松：调用点显式传 `signal`
 * 就能放宽或收紧（模型生成、知识库入库这类长耗时端点属于前者）。没有它时，一个卡住的后端会
 * 让界面无限等待——查询层的 `retry` 也是关的，不会自己重试出来。
 */
const DEFAULT_TIMEOUT_MS = 120_000;

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
  // 超时与取消由浏览器抛 DOMException，它不是 Error 子类，因此按 name 识别。
  const name = (detail as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError') return '请求超时，请重试。';
  if (name === 'AbortError') return '请求已取消。';
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

/** 未认证入口。登录是唯一不需要凭据的写接口，带上旧 token 会让「密码错误」的 401 被当成会话失效。 */
const UNAUTHENTICATED_PATHS = ['/api/auth/token'];

const isUnauthenticated = (url: string): boolean =>
  UNAUTHENTICATED_PATHS.some((path) => url.split('?')[0].endsWith(path));

/**
 * 401 的语义是凭据被拒。只有携带凭据的请求才谈得上「会话失效」，
 * 未认证入口的 401 不该清凭据、也不该派发未授权事件。
 */
function notifyUnauthorized(response: Response, credentialed: boolean): void {
  if (response.status !== 401 || !credentialed) return;
  setAccessToken(null);
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

/**
 * 手写层的请求入口：注入 Bearer、统一错误、401 副作用。
 *
 * 不设默认超时：SSE 流与文件下载共用这个入口，全局超时会把合法长连接掐断。需要边界的
 * 调用点自己传 `signal`（生成客户端那条路径的默认超时见 `DEFAULT_TIMEOUT_MS`）。
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  if (!response.ok) {
    notifyUnauthorized(response, headers.has('Authorization'));
    throw await toApiError(response);
  }
  return response;
}

// 生成物实例的配置：同源相对路径，鉴权与 401 处理统一在这里。
client.setConfig({ baseUrl: '' });

/**
 * 给请求挂默认超时；调用点显式传了 `signal` 就让位。
 *
 * `Request.signal` 永远存在（浏览器会给一个不会中止的），因此"挂没挂上超时"只能靠这个函数
 * 的返回是否被重建来判断，而不是看 `request.signal` 是否存在。时长作为参数是为了让该判断
 * 在测试里可以用毫秒级取值观察，不必等默认的 120 秒。
 */
export const applyRequestTimeout = (
  request: Request,
  options: { signal?: AbortSignal | null },
  timeoutMs: number,
): Request =>
  options.signal
    ? request
    : new Request(request, { signal: AbortSignal.timeout(timeoutMs) });

client.interceptors.request.use((request, options) => {
  if (!isUnauthenticated(request.url)) {
    const token = getAccessToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
  }

  return applyRequestTimeout(request, options, DEFAULT_TIMEOUT_MS);
});

client.interceptors.response.use((response, request) => {
  notifyUnauthorized(response, request.headers.has('Authorization'));
  return response;
});

/**
 * 生成客户端在 `throwOnError` 时抛的是响应体本身（`{detail}` 或 `{code, message}`），
 * 不是 `ApiError`。折成 `ApiError` 后，生成路径与手写路径的错误文案口径一致，调用方的
 * `describeFailure` 与各处 `error.message` 不需要按来源分支。
 */
client.interceptors.error.use((error, response) => {
  if (error instanceof ApiError) return error;

  const payload = error as { detail?: unknown } | null;
  return new ApiError(response?.status ?? 0, payload?.detail ?? error ?? null);
});

export { client as apiClient };
