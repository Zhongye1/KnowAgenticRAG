import { configureAuth } from 'react-query-auth';
import { Navigate, useLocation } from 'react-router';
import { z } from 'zod';

import { Spinner } from '@/components/ui/spinner';
import { paths } from '@/config/paths';
import { login } from '@/generated/auth/login';
import { logout } from '@/generated/auth/logout';
import { register } from '@/generated/auth/register';
import type { GetCurrentUserInfoWithRelationDetail } from '@/generated/types';

import { api, setAccessToken } from './api-client';

// 认证接口统一走 OpenAPI 生成封装（src/generated/auth、src/generated/sys-users）。
// 后端响应形如 { code, msg, data }，生成代码已用 .then(res => res.data) 解包。

export const loginInputSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

/**
 * 会话用户 = 后端 `GET /api/v1/sys/users/me` 的返回结构。
 *
 * 此前这里用的是 fba 模板遗留的 `types/api.ts:User`（`firstName/lastName/role`），
 * 与后端根本对不上，只能靠 `as unknown as User` 强转，消费端读到的全是 undefined。
 * 现在直接对齐生成类型。
 */
export type SessionUser = GetCurrentUserInfoWithRelationDetail;

export type LoginInput = z.infer<typeof loginInputSchema> & {
  uuid?: string;
  captcha?: string;
};

export const registerInputSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(6, '密码至少 6 位'),
  nickname: z.string().optional(),
  email: z
    .string()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: '邮箱格式不正确',
    }),
  uuid: z.string().optional(),
  captcha: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

const authConfig = {
  userFn: async () => {
    try {
      // 走原生请求并跳过全局 401 拦截：匿名访问首页/登录页时不会触发错误提示与跳转
      const body = await api.get(`/api/v1/sys/users/me`, {
        skipAuthErrorHandling: true,
      });
      return (body as { data: SessionUser }).data;
    } catch {
      // 未登录/凭证失效视为匿名用户，由 ProtectedRoute 决定是否跳转登录页
      return null;
    }
  },
  loginFn: async (data: LoginInput) => {
    const res = await login(data);
    // access_token 由前端保存，后续请求经 api-client 注入 Authorization: Bearer
    setAccessToken(res.access_token);
    return res.user as unknown as SessionUser;
  },
  registerFn: async (data: RegisterInput) => {
    // 当前后端注册只落库、不发 token（见 docs/工程治理/auth-flow.md），
    // 不置登录态，注册成功后由表单引导去登录页。
    await register(data);
    return null;
  },
  logoutFn: async () => {
    await logout();
    setAccessToken(null);
  },
};

const { useUser: useAuthUser, useLogin, useLogout, useRegister } =
  configureAuth(authConfig);

type UseUserOptions = Parameters<typeof useAuthUser>[0];

export const useUser = (options?: UseUserOptions) =>
  useAuthUser({
    retry: false,
    staleTime: 5 * 60 * 1000,
    ...options,
  });

export { useLogin, useLogout, useRegister };

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const user = useUser();
  const location = useLocation();

  if (user.isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Spinner/>
      </div>
    );
  }

  if (!user.data) {
    return (
      <Navigate to={paths.auth.login.getHref(location.pathname)} replace />
    );
  }

  return children;
};

/**
 * 当前用户是否超级管理员（admin 面板准入）。
 *
 * **这只是体验级约束**：后端 FastAPI 依赖与 repository 可见性查询才是最终授权边界
 * （见 `docs/工程治理/` 与 backend/AGENTS.md §5）。前端守卫的价值是别把无权入口摆出来，
 * 不是替代后端校验。
 */
export const useIsSuperuser = () => useUser().data?.is_superuser === true;
