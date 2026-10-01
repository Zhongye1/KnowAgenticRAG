/**
 * 鉴权接口。所有请求经 `base.ts` 的 `apiFetch` 发出，token 注入、错误解析与 401 副作用只有那一处实现。
 */
import { ApiError, apiFetch, setAccessToken, toApiError } from '@/shared/api';
import { discoveryApiSystemDiscoveryGet } from '@/shared/api/generated/sdk.gen';

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

/**
 * 登录使用 OAuth2 口令流（表单编码）。这里是唯一不经 `apiFetch` 的请求：
 * 登录尚未持有会话，且 401 表示凭据被拒，不该触发「会话失效」的副作用。
 */
export async function login(params: {
  username: string;
  password: string;
}): Promise<LoginResult> {
  const body = new URLSearchParams();
  body.set('username', params.username);
  body.set('password', params.password);

  const response = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  const result = (await response.json()) as LoginResult;
  setAccessToken(result.access_token);
  return result;
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
