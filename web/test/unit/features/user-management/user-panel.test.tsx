import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AntdProvider } from '@/app/theme/antd-provider';
import type { ManagedUser } from '@/entities/user-admin';

/**
 * 用户管理面板：渲染真实组件，只把实体层与确认框换成桩。
 *
 * 覆盖表格渲染、自己与超管的删除门禁、分页器的出现条件、空列表文案随筛选变化，以及
 * 编辑态「改密码」勾选前后提交载荷的差别。
 */
const mocks = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  total: 0,
  isLoading: false,
  refetch: vi.fn(),
  refetchDepartments: vi.fn(),
  currentUserId: 1,
  isSuperuser: true,
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  validateUsername: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@/entities/session', () => ({
  MIN_PASSWORD_LENGTH: 8,
  useUser: () => ({ data: { id: mocks.currentUserId, role: 'superadmin' } }),
  useIsSuperuser: () => mocks.isSuperuser,
  useIsAdmin: () => true,
  formatUserRole: (role: string) =>
    ({ superadmin: '超级管理员', admin: '管理员' })[role] ?? '普通用户',
}));

vi.mock('@/entities/department', () => ({
  useDepartments: () => ({
    departments: [{ id: 2, name: '研发部' }],
    refetch: mocks.refetchDepartments,
  }),
}));

vi.mock('@/entities/user-admin', () => ({
  useManagedUsers: () => ({
    users: mocks.users,
    total: mocks.total,
    isLoading: mocks.isLoading,
    refetch: mocks.refetch,
  }),
  useCreateManagedUser: () => ({
    mutateAsync: mocks.createUser,
    isPending: false,
  }),
  useUpdateManagedUser: () => ({
    mutateAsync: mocks.updateUser,
    isPending: false,
  }),
  useDeleteManagedUser: () => ({
    mutateAsync: mocks.deleteUser,
    isPending: false,
  }),
  validateUsernameAndGenerateUid: mocks.validateUsername,
}));

vi.mock('@/shared/ui/confirm-dialog', () => ({
  useConfirm: () => ({ confirm: mocks.confirm }),
}));

const { UserManagementPanel } = await import('@/features/user-management');

const managedUser = (overrides: Partial<ManagedUser> = {}): ManagedUser => ({
  id: 9,
  username: 'zwj',
  uid: 'zwj',
  phoneNumber: '15251638888',
  avatar: '',
  role: 'user',
  departmentId: 2,
  departmentName: '研发部',
  lastLogin: '2026-10-13T09:00:00',
  ...overrides,
});

const renderPanel = () =>
  render(
    <AntdProvider>
      <UserManagementPanel notifySuccess={vi.fn()} notifyError={vi.fn()} />
    </AntdProvider>,
  );

beforeEach(() => {
  mocks.users = [managedUser()];
  mocks.total = 1;
  mocks.isLoading = false;
  mocks.currentUserId = 1;
  mocks.isSuperuser = true;
  mocks.refetch.mockReset();
  mocks.refetchDepartments.mockReset();
  mocks.createUser.mockReset().mockResolvedValue(undefined);
  mocks.updateUser.mockReset().mockResolvedValue(undefined);
  mocks.deleteUser.mockReset().mockResolvedValue(undefined);
  mocks.validateUsername.mockReset().mockResolvedValue({
    uid: 'zwj_01',
    isAvailable: true,
  });
  mocks.confirm.mockReset().mockResolvedValue(true);
});

describe('用户管理表格', () => {
  it('渲染用户名、登录 ID、角色、部门与手机号', () => {
    renderPanel();

    expect(screen.getByText('zwj')).toBeTruthy();
    expect(screen.getByText('ID: zwj')).toBeTruthy();
    expect(screen.getByText('普通用户')).toBeTruthy();
    expect(screen.getByText('研发部')).toBeTruthy();
    expect(screen.getByText('15251638888')).toBeTruthy();
    expect(screen.getByText('2026-10-13 09:00')).toBeTruthy();
  });

  it('不能删除自己', () => {
    mocks.currentUserId = 9;
    renderPanel();

    expect(
      (screen.getByLabelText('删除 zwj') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('普通管理员不能删超管，超管可以', () => {
    mocks.users = [
      managedUser({ id: 9, username: 'root', role: 'superadmin' }),
    ];

    mocks.isSuperuser = false;
    const first = renderPanel();
    expect(
      (screen.getByLabelText('删除 root') as HTMLButtonElement).disabled,
    ).toBe(true);
    first.unmount();

    mocks.isSuperuser = true;
    renderPanel();
    expect(
      (screen.getByLabelText('删除 root') as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('总数不超过一页时不渲染分页器', () => {
    mocks.total = 20;
    const first = renderPanel();
    expect(screen.queryByRole('listitem', { name: /页/ })).toBeNull();
    expect(document.querySelector('.ant-pagination')).toBeNull();
    first.unmount();

    mocks.total = 21;
    renderPanel();
    expect(document.querySelector('.ant-pagination')).toBeTruthy();
  });

  it('空列表文案随筛选变化', async () => {
    const user = userEvent.setup();
    mocks.users = [];
    mocks.total = 0;
    renderPanel();

    expect(screen.getByText('暂无用户数据')).toBeTruthy();

    await user.type(
      screen.getByPlaceholderText('搜索用户名 / ID / 手机号'),
      'zwj',
    );
    // 防抖 250ms 后才带着关键词重取；文案按输入框当前值判定，无需等请求
    expect(await screen.findByText('没有匹配的用户')).toBeTruthy();
  });

  it('确认后按用户 id 删除', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByLabelText('删除 zwj'));

    await waitFor(() => expect(mocks.deleteUser).toHaveBeenCalledWith(9));
  });
});

describe('用户表单', () => {
  it('创建时用户名失焦取回登录 ID 并展示', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: '添加用户' }));
    await user.type(screen.getByLabelText('用户名'), 'newbie');
    await user.tab();

    expect(await screen.findByText(/登录ID：zwj_01/)).toBeTruthy();
  });

  it('创建提交角色与密码', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: '添加用户' }));
    await user.type(screen.getByLabelText('用户名'), 'newbie');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() =>
      expect(mocks.createUser).toHaveBeenCalledWith({
        username: 'newbie',
        password: 'secret123',
        role: 'user',
      }),
    );
  });

  it('编辑态默认不校验密码；勾上「修改密码」后才要求填写', async () => {
    const user = userEvent.setup();
    const notifyError = vi.fn();
    render(
      <AntdProvider>
        <UserManagementPanel
          notifySuccess={vi.fn()}
          notifyError={notifyError}
        />
      </AntdProvider>,
    );

    await user.click(screen.getByLabelText('编辑 zwj'));
    // 编辑态没有角色下拉（角色不可改）
    expect(screen.queryByLabelText('角色')).toBeNull();

    await user.click(screen.getByRole('button', { name: '确定' }));
    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith({
        id: 9,
        input: { username: 'zwj', phoneNumber: '15251638888', departmentId: 2 },
      }),
    );

    mocks.updateUser.mockClear();
    await user.click(screen.getByLabelText('编辑 zwj'));
    await user.click(screen.getByRole('checkbox', { name: '修改密码' }));
    await user.click(screen.getByRole('button', { name: '确定' }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('密码不能为空'),
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
