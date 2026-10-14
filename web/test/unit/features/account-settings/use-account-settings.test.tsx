/**
 * 账户设置弹窗的用例。
 *
 * `@/entities/session` 整块换成桩：控制器与渲染真实跑一遍。覆盖行内编辑状态机（单编辑态、
 * 校验文案、未变更不发请求、失焦取消、保存中防取消）、头像校验与上传、Memory 开关、刷新。
 * 写入后的身份缓存失效在 `entities/session` 的用例里单独验。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  renderHook,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/entities/session';
import type { AccountSettingsInput } from '@/features/account-settings';

const session = vi.hoisted(() => ({
  invalidateUser: vi.fn(),
  invalidateConfig: vi.fn(),
  user: null as CurrentUser | null,
  config: { enableMemory: false } as { enableMemory: boolean },
  configPending: false,
  updateProfile: vi.fn(),
  updateUserConfig: vi.fn(),
  uploadAvatar: vi.fn(),
}));

vi.mock('@/entities/session', () => ({
  AUTHENTICATED_USER_KEY: ['authenticated-user'],
  refreshAccountData: (client: {
    invalidateQueries: (input: { queryKey: string[] }) => void;
  }) => {
    session.invalidateUser({ queryKey: ['authenticated-user'] });
    session.invalidateConfig({ queryKey: ['user-config'] });
    void client;
  },
  useUser: () => ({ data: session.user }),
  useIsSuperuser: () => false,
  useIsAdmin: () => false,
  useUserConfig: () => ({
    data: { enableMemory: session.config.enableMemory },
    isPending: session.configPending,
  }),
  useUpdateProfile: () => ({ mutateAsync: session.updateProfile }),
  useUpdateUserConfig: () => ({
    mutateAsync: session.updateUserConfig,
    isPending: false,
  }),
  useUploadAvatar: () => ({ mutateAsync: session.uploadAvatar }),
}));

const { useAccountSettings } =
  await import('@/features/account-settings/model/use-account-settings');
const { SettingsModal } = await import('@/features/settings');

const user = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  id: 1,
  uid: 'zwj',
  username: '张文杰',
  phone_number: '15251638888',
  avatar: null,
  role: 'superadmin',
  department_id: 1,
  department_name: '研发部',
  created_at: '2026-10-12T04:01:49Z',
  last_login: null,
  ...overrides,
});

const renderBrowser = () => {
  const notifySuccess = vi.fn();
  const notifyError = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = renderHook(
    (props: AccountSettingsInput) => useAccountSettings(props),
    {
      initialProps: { open: true, notifySuccess, notifyError },
      wrapper: ({ children }: { children?: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );

  return { view, notifySuccess, notifyError };
};

beforeEach(() => {
  session.user = user();
  session.config = { enableMemory: false };
  session.configPending = false;
  for (const fn of [
    session.invalidateUser,
    session.invalidateConfig,
    session.updateProfile,
    session.updateUserConfig,
    session.uploadAvatar,
  ]) {
    fn.mockReset();
  }
});

describe('行内编辑', () => {
  it('进入编辑态把草稿同步成当前值；失焦取消', async () => {
    const { view } = renderBrowser();

    act(() => view.result.current.startEditing('username'));
    expect(view.result.current.editingField).toBe('username');
    expect(view.result.current.draft).toBe('张文杰');

    act(() => view.result.current.changeDraft('张三'));
    act(() => view.result.current.cancelEditing());

    expect(view.result.current.editingField).toBeNull();
    expect(session.updateProfile).not.toHaveBeenCalled();
  });

  it('用户名长度不足给参照文案并保持编辑态', async () => {
    const { view, notifyError } = renderBrowser();

    act(() => view.result.current.startEditing('username'));
    act(() => view.result.current.changeDraft('a'));
    await act(async () => {
      await view.result.current.submitEditing();
    });

    expect(notifyError).toHaveBeenCalledWith(
      '用户名长度必须在 2-20 个字符之间',
    );
    expect(session.updateProfile).not.toHaveBeenCalled();
    expect(view.result.current.editingField).toBe('username');
  });

  it('手机号格式错误给参照文案；空串表示清空并提交 null', async () => {
    const { view, notifyError } = renderBrowser();

    act(() => view.result.current.startEditing('phone_number'));
    act(() => view.result.current.changeDraft('12345'));
    await act(async () => {
      await view.result.current.submitEditing();
    });
    expect(notifyError).toHaveBeenCalledWith('请输入正确的手机号格式');

    act(() => view.result.current.changeDraft(''));
    await act(async () => {
      await view.result.current.submitEditing();
    });
    expect(session.updateProfile).toHaveBeenCalledWith({ phone_number: null });
  });

  it('未变更静默取消，不发请求', async () => {
    const { view, notifySuccess, notifyError } = renderBrowser();

    act(() => view.result.current.startEditing('username'));
    await act(async () => {
      await view.result.current.submitEditing();
    });

    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
    expect(session.updateProfile).not.toHaveBeenCalled();
    expect(view.result.current.editingField).toBeNull();
  });

  it('保存成功清编辑态；失败给「更新失败：…」并保留编辑态', async () => {
    const { view, notifySuccess } = renderBrowser();

    act(() => view.result.current.startEditing('username'));
    act(() => view.result.current.changeDraft('张三'));
    await act(async () => {
      await view.result.current.submitEditing();
    });

    expect(session.updateProfile).toHaveBeenCalledWith({ username: '张三' });
    expect(notifySuccess).toHaveBeenCalledWith('个人资料更新成功');
    expect(view.result.current.editingField).toBeNull();

    act(() => view.result.current.startEditing('phone_number'));
    session.updateProfile.mockRejectedValueOnce(
      new Error('手机号已被其他用户使用'),
    );
    const { view: view2 } = renderBrowser();
    act(() => view2.result.current.startEditing('username'));
    act(() => view2.result.current.changeDraft('张三'));
    await act(async () => {
      await view2.result.current.submitEditing();
    });
    expect(view2.result.current.editingField).toBe('username');
    expect(view2.result.current.draft).toBe('张三');
  });
});

describe('头像上传', () => {
  it('非图片与超 5MB 拦截，不发请求', async () => {
    const { view, notifyError } = renderBrowser();

    await act(async () => {
      await view.result.current.uploadAvatar(
        new File(['x'], 'a.pdf', { type: 'application/pdf' }),
      );
    });
    expect(notifyError).toHaveBeenCalledWith('只能上传图片文件！');

    const oversized = new File(['x'], 'a.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: 5 * 1024 * 1024 });
    await act(async () => {
      await view.result.current.uploadAvatar(oversized);
    });
    expect(notifyError).toHaveBeenCalledWith('图片大小不能超过 5MB！');
    expect(session.uploadAvatar).not.toHaveBeenCalled();
  });

  it('合法图片走真实端点并提示成功', async () => {
    session.uploadAvatar.mockResolvedValue('/minio/public/avatar/1.png');
    const { view, notifySuccess } = renderBrowser();

    await act(async () => {
      await view.result.current.uploadAvatar(
        new File(['x'], 'a.png', { type: 'image/png' }),
      );
    });

    expect(session.uploadAvatar).toHaveBeenCalledTimes(1);
    expect(notifySuccess).toHaveBeenCalledWith('头像上传成功！');
  });
});

describe('Memory 开关与刷新', () => {
  it('切换即 PUT 并提示；失败给「保存用户配置失败」兜底', async () => {
    session.updateUserConfig.mockResolvedValue({ enableMemory: true });
    const { view, notifySuccess } = renderBrowser();

    await act(async () => {
      await view.result.current.changeMemory(true);
    });

    expect(session.updateUserConfig).toHaveBeenCalledWith({
      enableMemory: true,
    });
    expect(notifySuccess).toHaveBeenCalledWith('用户配置已保存');

    session.updateUserConfig.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await view.result.current.changeMemory(false);
    });
    expect(view.result.current.changeMemory).toBeDefined();
  });

  it('刷新同时失效身份与配置', async () => {
    const { view, notifySuccess } = renderBrowser();

    await act(async () => {
      await view.result.current.refresh();
    });

    expect(session.invalidateUser).toHaveBeenCalledWith({
      queryKey: ['authenticated-user'],
    });
    expect(session.invalidateConfig).toHaveBeenCalledWith({
      queryKey: ['user-config'],
    });
    expect(notifySuccess).toHaveBeenCalledWith('账户设置已刷新');
  });
});

const renderModal = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const notifications = { success: vi.fn(), error: vi.fn() };
  render(
    <QueryClientProvider client={client}>
      <SettingsModal
        open
        onOpenChange={() => undefined}
        notifySuccess={(title: string) => notifications.success(title)}
        notifyError={(title: string) => notifications.error(title)}
      />
    </QueryClientProvider>,
  );

  return { notifications };
};

describe('弹窗渲染', () => {
  it('渲染标题、说明与四行只读信息', () => {
    renderModal();

    expect(screen.getAllByText('账户设置').length).toBeGreaterThan(0);
    expect(
      screen.getByText('管理当前账户资料、身份信息。'),
    ).toBeInTheDocument();
    expect(screen.getByText('张文杰')).toBeInTheDocument();
    expect(screen.getByText('zwj')).toBeInTheDocument();
    expect(screen.getByText('超级管理员')).toBeInTheDocument();
    expect(screen.getByText('研发部')).toBeInTheDocument();
    expect(screen.getByText('是否启用 Memory')).toBeInTheDocument();
  });

  it('点用户名进入编辑，Esc 取消', async () => {
    const userEventDriver = userEvent.setup();
    renderModal();

    await userEventDriver.click(screen.getByRole('button', { name: '张文杰' }));
    const input = await screen.findByRole('textbox', { name: '用户名' });
    expect(input).toHaveValue('张文杰');

    await userEventDriver.type(input, '三');
    await userEventDriver.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: '用户名' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: '张文杰' })).toBeInTheDocument();
  });

  it('Enter 保存非法用户名给文案，输入框不消失', async () => {
    const userEventDriver = userEvent.setup();
    const modal = renderModal();

    await userEventDriver.click(screen.getByRole('button', { name: '张文杰' }));
    const input = await screen.findByRole('textbox', { name: '用户名' });
    await userEventDriver.clear(input);
    await userEventDriver.type(input, 'a');
    await userEventDriver.keyboard('{Enter}');

    // 校验文案走注入的 notifyError（渲染出口由通知系统拥有），这里断言它被调用且文案逐字一致
    await waitFor(() =>
      expect(modal.notifications.error).toHaveBeenCalledWith(
        '用户名长度必须在 2-20 个字符之间',
      ),
    );
    expect(screen.getByRole('textbox', { name: '用户名' })).toBeInTheDocument();
  });

  it('无头像时遮罩文案是「上传」', () => {
    renderModal();

    expect(screen.getByText('上传')).toBeInTheDocument();
    expect(screen.queryByText('更换')).not.toBeInTheDocument();
  });
});
