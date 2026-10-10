/**
 * 登录成功后的身份缓存契约。
 *
 * 路由守卫读的是 `['authenticated-user']`。若登录成功只在缓存里写一个 `null`，
 * 5 分钟 staleTime 内守卫会拿到这个 `null`，把刚登录成功的用户弹回登录页。
 * 这里盯住「登录成功后缓存条目必须消失，下一次读取要重新请求 /me」。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentUser, login } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
}));

vi.mock('@/entities/session/api/session-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/entities/session/api/session-api')
  >('@/entities/session/api/session-api');
  return {
    ...actual,
    getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
    login: (...args: unknown[]) => login(...args),
  };
});

const { useLogin, useUser } = await import('@/entities/session');

const session = {
  access_token: 'ars.token',
  token_type: 'bearer',
  user_id: 1,
  uid: 'zwj',
  username: 'zwj',
  role: 'superadmin',
};

const currentUser = {
  id: 1,
  uid: 'zwj',
  username: 'zwj',
  phone_number: null,
  avatar: null,
  role: 'superadmin',
  department_id: null,
  department_name: null,
  created_at: '2026-10-10T00:00:00Z',
  last_login: null,
};

describe('登录成功后的身份缓存', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
    });
    getCurrentUser.mockReset();
    login.mockReset();
  });

  it('登录成功后不留下匿名身份，守卫重新挂载时必须重新请求', async () => {
    // 登录页挂载时的匿名读取，结果是 null
    getCurrentUser.mockResolvedValueOnce(null);
    const anonymous = renderHook(() => useUser(), { wrapper });
    await waitFor(() => expect(anonymous.result.current.isSuccess).toBe(true));
    expect(anonymous.result.current.data).toBeNull();
    anonymous.unmount();

    login.mockResolvedValue(session);
    const { result } = renderHook(() => useLogin(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ username: 'zwj', password: 'pw' });
    });

    // 守卫在跳转后重新挂载：必须重新请求 /me，而不是复用登录前的 null
    getCurrentUser.mockResolvedValueOnce(currentUser);
    const guard = renderHook(() => useUser(), { wrapper });
    await waitFor(() => expect(guard.result.current.data?.uid).toBe('zwj'));
    expect(getCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('初始化超管成功后同样不留匿名身份', async () => {
    queryClient.setQueryData(['authenticated-user'], null);

    const { result } = renderHook(() => useLogin(), { wrapper });
    login.mockResolvedValue(session);
    await act(async () => {
      await result.current.mutateAsync({ username: 'zwj', password: 'pw' });
    });

    expect(queryClient.getQueryData(['authenticated-user'])).toBeUndefined();
  });
});
