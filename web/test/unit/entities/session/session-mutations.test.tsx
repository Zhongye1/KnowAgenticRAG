/**
 * 会话写入层的失效规则。
 *
 * 资料与头像写入必须失效身份缓存（staleTime 5 分钟，不失效就会显示旧资料）；
 * `refreshAccountData` 必须同时失效身份与用户配置。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  updateProfileApiAuthProfilePut: vi.fn(),
  uploadUserAvatarApiAuthUploadAvatarPost: vi.fn(),
  getUserConfigApiUserConfigGet: vi.fn(),
  updateUserConfigApiUserConfigPut: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => api);

const { AUTHENTICATED_USER_KEY, refreshAccountData } =
  await import('@/entities/session');

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const spy = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children?: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return { client, spy, wrapper };
};

describe('会话写入后的身份缓存失效', () => {
  it('资料写入成功后失效身份缓存', async () => {
    api.updateProfileApiAuthProfilePut.mockResolvedValue({
      data: { id: 1, username: '张三' },
    });
    const { client, spy, wrapper } = setup();
    client.setQueryData(AUTHENTICATED_USER_KEY, { id: 1 });

    const { useUpdateProfile } = await import('@/entities/session');
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });
    result.current.mutate({ username: '张三' });

    await waitFor(() => result.current.isSuccess);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: AUTHENTICATED_USER_KEY }),
    );
  });

  it('头像上传成功后失效身份缓存', async () => {
    api.uploadUserAvatarApiAuthUploadAvatarPost.mockResolvedValue({
      data: { success: true, avatar_url: '/minio/public/avatar/1.png' },
    });
    const { client, spy, wrapper } = setup();
    client.setQueryData(AUTHENTICATED_USER_KEY, { id: 1 });

    const { useUploadAvatar } = await import('@/entities/session');
    const { result } = renderHook(() => useUploadAvatar(), { wrapper });
    result.current.mutate(new File(['x'], 'a.png', { type: 'image/png' }));

    await waitFor(() => result.current.isSuccess);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: AUTHENTICATED_USER_KEY }),
    );
  });

  it('refreshAccountData 同时失效身份与用户配置', async () => {
    const { client, spy } = setup();

    refreshAccountData(client);

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        queryKey: AUTHENTICATED_USER_KEY,
      }),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ['user-config'] });
  });
});
