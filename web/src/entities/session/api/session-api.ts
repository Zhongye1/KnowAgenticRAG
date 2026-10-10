/**
 * 鉴权接口。路径、请求体编码与响应类型都由契约生成物拥有；token 注入、错误折叠与
 * 401 副作用只有 `shared/api/base.ts` 与 `shared/api/result.ts` 两处实现。
 */
import {
  ApiError,
  apiFetch,
  setAccessToken,
  toResultError,
  unwrap,
} from '@/shared/api';
import {
  checkFirstRunApiAuthCheckFirstRunGet,
  discoveryApiSystemDiscoveryGet,
  getOidcConfigApiAuthOidcConfigGet,
  getOidcLoginUrlApiAuthOidcLoginUrlGet,
  initializeAdminApiAuthInitializePost,
  loginForAccessTokenApiAuthTokenPost,
} from '@/shared/api/generated/sdk.gen';

import { parseRemainingSecondsFromDetail } from '../lib/login-lock';

/** 后端在锁定与限速上的状态码，页面据此区分「凭据错误」与「等一会儿再来」。 */
export const LOGIN_LOCKED_STATUS = 423;

export type CurrentUser = {
  id: number;
  uid: string;
  username: string;
  phone_number: string | null;
  avatar: string | null;
  role: string;
  department_id: number | null;
  department_name: string | null;
  created_at: string;
  last_login: string | null;
};

export type LoginResult = {
  access_token: string;
  token_type: string;
  user_id: number;
  uid: string;
  username: string;
  role: string;
};

export type InitializeAdminInput = {
  uid: string;
  password: string;
  phone_number?: string | null;
};

export type OidcConfig = {
  enabled: boolean;
  login_url?: string | null;
  provider_name?: string | null;
};

export type OidcLoginUrl = { login_url: string };

/**
 * 登录被锁定（HTTP 423）。剩余秒数优先取 `X-Lock-Remaining` 头，
 * 头缺失时从 detail 文案兜底解析；两处都拿不到时只显示文案，不启动倒计时。
 */
export class LoginLockedError extends ApiError {
  readonly remainingSeconds: number;

  constructor(detail: unknown, remainingSeconds: number) {
    super(LOGIN_LOCKED_STATUS, detail);
    this.name = 'LoginLockedError';
    this.remainingSeconds = remainingSeconds;
  }
}

function readLockRemainingSeconds(
  response: Response | undefined,
  detail: unknown,
): number {
  const header = response?.headers.get('X-Lock-Remaining') ?? null;
  const fromHeader = header === null ? Number.NaN : Number.parseInt(header, 10);
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return fromHeader;
  }
  return parseRemainingSecondsFromDetail(detail);
}

/**
 * 登录走 OAuth2 口令流（表单编码），生成物已经带好编码器与 `Content-Type`。
 *
 * 两条错误路径要分开：423 带上 `X-Lock-Remaining` 抛 `LoginLockedError` 供页面倒计时；
 * 其余（含 401 凭据错误）抛普通 `ApiError`。登录请求不带旧凭据，401 不会触发会话失效。
 */
export async function login(params: {
  username: string;
  password: string;
}): Promise<LoginResult> {
  const result = await loginForAccessTokenApiAuthTokenPost({
    body: { username: params.username, password: params.password },
  });

  if (result.error !== undefined) {
    const error = toResultError(result);
    if (error.status === LOGIN_LOCKED_STATUS) {
      throw new LoginLockedError(
        error.detail,
        readLockRemainingSeconds(result.response, error.detail),
      );
    }
    throw error;
  }

  const token = result.data as LoginResult;
  setAccessToken(token.access_token);
  return token;
}

/** 干净库判定。失败向上抛，调用方按「非首次运行」处理，不擅自进入初始化表单。 */
export async function checkFirstRun(): Promise<boolean> {
  const payload = unwrap<{ first_run?: boolean }>(
    await checkFirstRunApiAuthCheckFirstRunGet(),
  );
  return payload.first_run === true;
}

/** 创建首个超级管理员；成功后与登录同一条凭据路径。 */
export async function initializeAdmin(
  input: InitializeAdminInput,
): Promise<LoginResult> {
  const token = unwrap<LoginResult>(
    await initializeAdminApiAuthInitializePost({
      body: {
        uid: input.uid,
        password: input.password,
        phone_number: input.phone_number ?? null,
      },
    }),
  );
  setAccessToken(token.access_token);
  return token;
}

export async function getOidcConfig(): Promise<OidcConfig> {
  const config = unwrap<OidcConfig>(
    await getOidcConfigApiAuthOidcConfigGet(),
  );
  return {
    enabled: config.enabled === true,
    login_url: config.login_url ?? null,
    provider_name: config.provider_name ?? null,
  };
}

export async function getOidcLoginUrl(
  redirectPath: string = '/',
): Promise<OidcLoginUrl> {
  const payload = unwrap<{ login_url?: string }>(
    await getOidcLoginUrlApiAuthOidcLoginUrlGet({
      query: { redirect_path: redirectPath },
    }),
  );
  return { login_url: payload.login_url ?? '' };
}

/** 未登录返回 null；`apiFetch` 已在 401 时清除凭据，这里把状态映射成匿名。 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const response = await apiFetch('/api/auth/me');
    return (await response.json()) as CurrentUser;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

/** 能力投影：LITE 模式下 knowledge 为 false，UI 据此降级。 */
export type Discovery = {
  name: string;
  version: string;
  api_prefix: string;
  capabilities: { features: { knowledge: boolean } };
};

/**
 * 走契约生成的 SDK：client 实例与拦截器由 `base.ts` 配置，这里只解一层
 * `{ data, error }`（生成物默认的 fields 返回风格）。
 */
export async function getDiscovery(): Promise<Discovery> {
  const { data, error } = await discoveryApiSystemDiscoveryGet();

  if (error !== undefined) {
    throw new ApiError(0, error);
  }
  return data as Discovery;
}
