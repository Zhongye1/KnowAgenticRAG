import Axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

import { useNotifications } from '@/components/ui/notifications';
import { env } from '@/config/env';
import { paths } from '@/config/paths';

const ACCESS_TOKEN_KEY = 'access_token';

declare module 'axios' {
  export interface AxiosRequestConfig {
    // 跳过全局 401 错误提示与跳转，用于"可选鉴权"请求（如 /me 用户探测）
    skipAuthErrorHandling?: boolean;
    // 标记该请求已经过 401 自动刷新重试，避免无限循环
    isRetry?: boolean;
  }
}

export const getAccessToken = () => {
  try {
    return typeof window !== 'undefined'
      ? window.localStorage.getItem(ACCESS_TOKEN_KEY)
      : null;
  } catch {
    return null;
  }
};

export const setAccessToken = (token: string | null) => {
  try {
    if (typeof window === 'undefined') return;
    if (token) {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  } catch {
    // ignore storage failures (e.g. private mode)
  }
};

// 刷新 token 使用独立实例，避免经过 api 拦截器造成递归
const rawApi = Axios.create({
  baseURL: env.API_URL,
  withCredentials: true,
});

let refreshPromise: Promise<string | null> | null = null;

// 供流式请求（fetch + SSE，不走 axios 拦截器）在 401 时复用单飞刷新
export const refreshAccessToken = (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = rawApi
      .post<{ data: { access_token: string } }>('/api/v1/auth/refresh')
      .then((res) => {
        const token = res.data?.data?.access_token;
        if (token) {
          setAccessToken(token);
          return token;
        }
        setAccessToken(null);
        return null;
      })
      .catch(() => {
        // 刷新失败（refresh token 过期/失效），清除本地 token
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

const isAuthSubmitUrl = (url?: string) =>
  Boolean(url?.includes('/api/v1/auth/login'));

const redirectToLogin = () => {
  // 已在登录页时不再跳转，避免 userFn 401 造成死循环
  const alreadyOnLogin =
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith(paths.auth.login.path);

  if (!alreadyOnLogin && !import.meta.env.TEST) {
    const searchParams = new URLSearchParams();
    const redirectTo =
      searchParams.get('redirectTo') || window.location.pathname;
    window.location.href = paths.auth.login.getHref(redirectTo);
  }
};

const handleRequestError = (error: AxiosError) => {
  const data = error.response?.data as
    { message?: string; msg?: string } | undefined;
  const message = data?.message || data?.msg || error.message;
  useNotifications.getState().addNotification({
    type: 'error',
    title: 'Error',
    message,
  });

  if (error.response?.status === 401) {
    redirectToLogin();
  }

  return Promise.reject(error);
};

const refreshAndRetry = async (error: AxiosError): Promise<unknown> => {
  const config = error.config;
  const token = await refreshAccessToken();

  if (token && config) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
    config.isRetry = true;
    return api.request(config);
  }

  if (config?.skipAuthErrorHandling) {
    return Promise.reject(error);
  }

  return handleRequestError(error);
};

function authRequestInterceptor(config: InternalAxiosRequestConfig) {
  if (config.headers) {
    config.headers.Accept = 'application/json';

    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  config.withCredentials = true;
  return config;
}

export const api = Axios.create({
  baseURL: env.API_URL,
});

api.interceptors.request.use(authRequestInterceptor);
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error: AxiosError) => {
    const config = error.config;
    const status = error.response?.status;

    // 401：除登录请求和已重试过的请求外，先刷新 token 再重试原请求
    if (
      status === 401 &&
      config &&
      !config.isRetry &&
      !isAuthSubmitUrl(config.url)
    ) {
      return refreshAndRetry(error);
    }

    if (config?.skipAuthErrorHandling) {
      return Promise.reject(error);
    }

    return handleRequestError(error);
  },
);
