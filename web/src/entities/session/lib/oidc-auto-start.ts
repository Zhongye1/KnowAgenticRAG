/**
 * OIDC 自动跳转与重定向安全校验。
 *
 * 与 KnowAgenticRAG `src/utils/oidcAutoStart.js` 同名同语义：同一会话只自动跳一次，
 * 避免回调失败后与登录页来回跳；重定向参数只放行站内相对路径。
 */

const AUTO_START_KEY = 'oidc_auto_start_attempted';
const OIDC_REDIRECT_KEY = 'oidc_redirect';

/**
 * 只放行以单个 `/` 开头的站内路径，挡掉 `//host` 与 `/\host` 这类开放重定向；
 * 缺失或不合法时用 `fallback`（本仓 `/` 还是占位页，调用方一般传聊天页）。
 */
export function sanitizeRedirect(
  value: unknown,
  fallback: string = '/',
): string {
  if (
    typeof value === 'string' &&
    value.length > 0 &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
  ) {
    return value;
  }
  return fallback;
}

export function hasAutoStartAttempted(): boolean {
  return sessionStorage.getItem(AUTO_START_KEY) === '1';
}

export function markAutoStartAttempted(): void {
  sessionStorage.setItem(AUTO_START_KEY, '1');
}

/** OIDC 登录成功后由回调页调用，允许下一次自动跳转。 */
export function clearAutoStartAttempt(): void {
  sessionStorage.removeItem(AUTO_START_KEY);
}

/** 记录登录成功后要回到的站内路径。 */
export function storeOidcRedirect(path: string): void {
  sessionStorage.setItem(OIDC_REDIRECT_KEY, sanitizeRedirect(path));
}

export function readOidcRedirect(): string {
  return sanitizeRedirect(sessionStorage.getItem(OIDC_REDIRECT_KEY));
}

type AutoStartDeps = {
  /** 取 OIDC 登录地址；失败视为不跳转。 */
  getLoginUrl: () => Promise<{ login_url?: string | null }>;
  /** 实际跳转动作由调用方注入，便于在不触发真实导航的前提下验证。 */
  navigate: (url: string) => void;
};

/**
 * 跨系统跳转场景：URL 带 `autostartOidc` 且未带 `oidc_error` 时自动进入 OIDC。
 * 返回 true 表示已发起跳转，调用方不应继续渲染登录流程。
 */
export async function tryAutoStartOIDC(
  enabled: boolean,
  deps: AutoStartDeps,
): Promise<boolean> {
  if (!enabled) return false;

  const params = new URLSearchParams(window.location.search);
  if (params.has('oidc_error')) return false;
  if (!params.has('autostartOidc')) return false;
  if (hasAutoStartAttempted()) return false;

  let loginUrl: string | null | undefined;
  try {
    loginUrl = (await deps.getLoginUrl()).login_url;
  } catch {
    return false;
  }
  if (!loginUrl) return false;

  storeOidcRedirect(sanitizeRedirect(params.get('redirect')));
  markAutoStartAttempted();
  deps.navigate(loginUrl);
  return true;
}
