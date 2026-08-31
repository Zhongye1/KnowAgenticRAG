import Axios, { InternalAxiosRequestConfig } from 'axios';

import { useNotifications } from '@/components/ui/notifications';
import { env } from '@/config/env';
import { paths } from '@/config/paths';

const ACCESS_TOKEN_KEY = 'access_token';

declare module 'axios' {
  export interface AxiosRequestConfig {
    // 跳过全局 401 错误提示与跳转，用于"可选鉴权"请求（如 /me 用户探测）
    skipAuthErrorHandling?: boolean;
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
  (error) => {
    if (error.config?.skipAuthErrorHandling) {
      return Promise.reject(error);
    }

    const message =
      error.response?.data?.message ||
      error.response?.data?.msg ||
      error.message;
    useNotifications.getState().addNotification({
      type: 'error',
      title: 'Error',
      message,
    });

    if (error.response?.status === 401) {
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
    }

    return Promise.reject(error);
  },
);
