/**
 * 会话状态。
 *
 * 凭据只存 `localStorage`，权限判断属于体验级约束；后端在依赖与 repository 处执行最终授权。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { UNAUTHORIZED_EVENT, setAccessToken } from '@/shared/api';

import {
  getCurrentUser,
  login as loginRequest,
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

export const useLogin = (
  options: { onSuccess?: (user: LoginResult) => void } = {},
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginRequest,
    onSuccess: (user) => {
      queryClient.setQueryData(['authenticated-user'], null);
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
