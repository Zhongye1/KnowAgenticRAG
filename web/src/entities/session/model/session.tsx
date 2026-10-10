/**
 * 会话状态。
 *
 * 凭据只存 `localStorage`，权限判断属于体验级约束；后端在依赖与 repository 处执行最终授权。
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import * as React from 'react';

import { UNAUTHORIZED_EVENT, setAccessToken } from '@/shared/api';

import {
  checkFirstRun as checkFirstRunRequest,
  getCurrentUser,
  getOidcConfig,
  getOidcLoginUrl,
  initializeAdmin,
  login as loginRequest,
  type InitializeAdminInput,
  type LoginResult,
} from '../api/session-api';

export const useUser = () => {
  return useQuery({
    queryKey: ['authenticated-user'],
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * 丢掉上一个身份缓存。
 *
 * 不能写 `setQueryData(key, null)`：staleTime 内下一次读取会直接拿到这个 null，
 * 路由守卫据此把刚登录成功的用户弹回登录页。删除条目让下一次读取重新请求 `/me`。
 */
function dropCachedIdentity(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: ['authenticated-user'] });
}

export const useLogin = (
  options: { onSuccess?: (user: LoginResult) => void } = {},
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginRequest,
    onSuccess: (user) => {
      dropCachedIdentity(queryClient);
      options.onSuccess?.(user);
    },
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      setAccessToken(null);
    },
    onSettled: () => {
      queryClient.clear();
    },
  });
};

/** 超管判定读取后端返回的 role；前端过滤只影响呈现。 */
export const useIsSuperuser = (): boolean => {
  const user = useUser();
  return user.data?.role === 'superadmin';
};

/**
 * 订阅 401 事件：凭据失效时清空当前用户缓存。
 * 清空后 `useUser` 变为匿名，路由守卫据此把用户送回登录页。
 */
export function useUnauthorizedReset(): void {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const handler = () => {
      queryClient.setQueryData(['authenticated-user'], null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  }, [queryClient]);
}

/**
 * 干净库判定。失败按「非首次运行」处理：后端不可达时不能把用户引到初始化表单，
 * 否则会用一个必然失败的提交掩盖真正的服务故障。
 */
export const useCheckFirstRun = () => {
  return useQuery({
    queryKey: ['first-run'],
    queryFn: checkFirstRunRequest,
    retry: false,
    staleTime: Infinity,
  });
};

/** 创建首个超级管理员；成功后与登录共用凭据写入与用户缓存失效路径。 */
export const useInitializeAdmin = (
  options: { onSuccess?: (user: LoginResult) => void } = {},
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: InitializeAdminInput) => initializeAdmin(input),
    onSuccess: (user) => {
      dropCachedIdentity(queryClient);
      queryClient.setQueryData(['first-run'], false);
      options.onSuccess?.(user);
    },
  });
};

/** OIDC 能力探测：`enabled` 为真才渲染第三方登录入口。 */
export const useOidcConfig = () => {
  return useQuery({
    queryKey: ['oidc-config'],
    queryFn: getOidcConfig,
    retry: false,
    staleTime: Infinity,
  });
};

/** 取 OIDC 跳转地址；真正的跳转是界面副作用，留在页面里做。 */
export const useOidcLoginUrl = () => {
  return useMutation({
    mutationFn: (redirectPath?: string) => getOidcLoginUrl(redirectPath),
  });
};
