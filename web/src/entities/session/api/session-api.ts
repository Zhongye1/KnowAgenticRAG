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
  getUserConfigApiUserConfigGet,
  initializeAdminApiAuthInitializePost,
  loginForAccessTokenApiAuthTokenPost,
  updateProfileApiAuthProfilePut,
  updateUserConfigApiUserConfigPut,
  uploadUserAvatarApiAuthUploadAvatarPost,
} from '@/shared/api/generated/sdk.gen';
import type {
  AvatarUploadResponse,
  DiscoveryResponse,
  FirstRunStatusResponse,
  OidcConfigResponse,
  OidcLoginUrlResponse,
  Token,
  UserConfigResponse,
  UserResponse,
} from '@/shared/api/generated/types.gen';

import { parseRemainingSecondsFromDetail } from '../lib/login-lock';

/** 后端在锁定与限速上的状态码，页面据此区分「凭据错误」与「等一会儿再来」。 */
export const LOGIN_LOCKED_STATUS = 423;

/** 当前登录用户；契约 `UserResponse`（`/api/auth/me`）。 */
export type CurrentUser = UserResponse;

/** 登录与初始化管理员的凭据结果；契约 `Token`。 */
export type LoginResult = Token;

export type InitializeAdminInput = {
  uid: string;
  password: string;
  phone_number?: string | null;
};

/** OIDC 能力探测结果；契约 `OidcConfigResponse`。 */
export type OidcConfig = OidcConfigResponse;

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
  const payload = unwrap<FirstRunStatusResponse>(
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
  const config = unwrap<OidcConfig>(await getOidcConfigApiAuthOidcConfigGet());
  return {
    enabled: config.enabled === true,
    login_url: config.login_url ?? null,
    provider_name: config.provider_name ?? null,
  };
}

export async function getOidcLoginUrl(
  redirectPath: string = '/',
): Promise<OidcLoginUrlResponse> {
  const payload = unwrap<OidcLoginUrlResponse>(
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

/** 资料更新的载荷；只传需要改的字段（显式 null 才清空手机号）。 */
export type ProfileUpdate = {
  username?: string;
  phone_number?: string | null;
};

/**
 * 更新自己的资料；服务端校验用户名与手机号（重名/格式错误给 400 detail），返回完整用户。
 *
 * 响应不再归一成第二份「用户长什么样」：调用方统一失效身份缓存重取，形状漂移留给 `useUser`。
 */
export async function updateProfile(input: ProfileUpdate): Promise<void> {
  unwrap<unknown>(
    await updateProfileApiAuthProfilePut({
      body: {
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.phone_number !== undefined
          ? { phone_number: input.phone_number }
          : {}),
      },
    }),
  );
}

/** 上传头像；服务端落库并返回可访问地址，客户端不需要再 PUT profile。 */
export async function uploadAvatar(file: File): Promise<string> {
  const payload = unwrap<AvatarUploadResponse>(
    await uploadUserAvatarApiAuthUploadAvatarPost({ body: { file } }),
  );
  const url =
    typeof payload.avatar_url === 'string' ? payload.avatar_url.trim() : '';
  if (!url) {
    throw new Error('头像上传失败：响应里没有头像地址');
  }

  return url;
}

/** 当前用户的配置；服务端没建过记录时 `enable_memory` 按缺省 false 读。 */
export async function getUserConfig(): Promise<{ enableMemory: boolean }> {
  const payload = unwrap<UserConfigResponse>(
    await getUserConfigApiUserConfigGet(),
  );

  return { enableMemory: payload.enable_memory === true };
}

/** 保存当前用户的配置；响应与服务端落库后的状态一致。 */
export async function updateUserConfig(input: {
  enableMemory: boolean;
}): Promise<{ enableMemory: boolean }> {
  const payload = unwrap<UserConfigResponse>(
    await updateUserConfigApiUserConfigPut({
      body: { enable_memory: input.enableMemory },
    }),
  );

  return { enableMemory: payload.enable_memory === true };
}

/** 能力投影：LITE 模式下 knowledge 为 false，UI 据此降级；契约 `DiscoveryResponse`。 */
export type Discovery = DiscoveryResponse;

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
