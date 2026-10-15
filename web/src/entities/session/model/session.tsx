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
  getUserConfig as getUserConfigRequest,
  initializeAdmin,
  login as loginRequest,
  updateProfile as updateProfileRequest,
  updateUserConfig as updateUserConfigRequest,
  uploadAvatar as uploadAvatarRequest,
  type InitializeAdminInput,
  type LoginResult,
  type ProfileUpdate,
} from '../api/session-api';

/** 身份缓存的 query key；登录、登出与资料写入都围绕它。 */
export const AUTHENTICATED_USER_KEY = ['authenticated-user'] as const;

export const useUser = () => {
  return useQuery({
    queryKey: AUTHENTICATED_USER_KEY,
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
  queryClient.removeQueries({ queryKey: AUTHENTICATED_USER_KEY });
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

/** 管理员判定（超管也算）；同样只影响呈现。 */
export const useIsAdmin = (): boolean => {
  const user = useUser();
  return user.data?.role === 'admin' || user.data?.role === 'superadmin';
};

/**
 * 订阅 401 事件：凭据失效时清空当前用户缓存。
 * 清空后 `useUser` 变为匿名，路由守卫据此把用户送回登录页。
 */
export function useUnauthorizedReset(): void {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const handler = () => {
      queryClient.setQueryData(AUTHENTICATED_USER_KEY, null);
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

/**
 * 更新自己的资料。
 *
 * 响应是完整用户，但不直接 `setQueryData`：`department_name` 等字段的归一只有 `useUser`
 * 一处事实，统一失效重取（staleTime 内也一样），避免两份「用户长什么样」。
 */
export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ProfileUpdate) => updateProfileRequest(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTHENTICATED_USER_KEY });
    },
  });
};

/** 上传头像；服务端已落库，失效身份缓存让遮罩文案与侧栏头像即时跟上。 */
export const useUploadAvatar = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadAvatarRequest(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTHENTICATED_USER_KEY });
    },
  });
};

/** 当前用户的配置；只在弹窗打开时启用，避免每个页面都多发一条请求。 */
export const useUserConfig = (enabled: boolean) => {
  return useQuery({
    queryKey: ['user-config'],
    queryFn: getUserConfigRequest,
    enabled,
    staleTime: 30 * 1000,
  });
};

/** 保存用户配置；成功后失效让弹窗内的读数与后端一致。 */
export const useUpdateUserConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUserConfigRequest,
    onSuccess: (saved) => {
      queryClient.setQueryData(['user-config'], saved);
    },
  });
};

/** 供「刷新」按钮同时重取两份数据：身份与用户配置。 */
export const refreshAccountData = (queryClient: QueryClient): void => {
  void queryClient.invalidateQueries({ queryKey: AUTHENTICATED_USER_KEY });
  void queryClient.invalidateQueries({ queryKey: ['user-config'] });
};
