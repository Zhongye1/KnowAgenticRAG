import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AntdProvider } from '@/app/theme/antd-provider';
import type { Department } from '@/entities/department';

/**
 * 部门管理面板：渲染真实组件，只把实体层与确认框换成桩。
 *
 * 覆盖表格渲染、默认部门禁删、创建（含管理员）提交载荷、以及编辑分支真的能提交出去
 * （编辑路径上会照样校验不渲染的管理员字段，导致编辑永远失败）。
 */
const mocks = vi.hoisted(() => ({
  departments: [] as Array<Record<string, unknown>>,
  isLoading: false,
  refetch: vi.fn(),
  createDepartment: vi.fn(),
  updateDepartment: vi.fn(),
  deleteDepartment: vi.fn(),
  checkUidAvailable: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@/entities/session', () => ({ MIN_PASSWORD_LENGTH: 8 }));

vi.mock('@/entities/department', () => ({
  useDepartments: () => ({
    departments: mocks.departments,
    isLoading: mocks.isLoading,
    refetch: mocks.refetch,
  }),
  useCreateDepartment: () => ({
    mutateAsync: mocks.createDepartment,
    isPending: false,
  }),
  useUpdateDepartment: () => ({
    mutateAsync: mocks.updateDepartment,
    isPending: false,
  }),
  useDeleteDepartment: () => ({
    mutateAsync: mocks.deleteDepartment,
    isPending: false,
  }),
}));

vi.mock('@/entities/user-admin', () => ({
  checkUidAvailable: mocks.checkUidAvailable,
}));

vi.mock('@/shared/ui/confirm-dialog', () => ({
  useConfirm: () => ({ confirm: mocks.confirm }),
}));

const { DepartmentManagementPanel } =
  await import('@/features/department-management');

const department = (overrides: Partial<Department> = {}): Department => ({
  id: 2,
  name: '研发部',
  description: '负责平台',
  createdAt: '2026-10-01T00:00:00',
  userCount: 3,
  ...overrides,
});

const renderPanel = () =>
  render(
    <AntdProvider>
      <DepartmentManagementPanel
        notifySuccess={vi.fn()}
        notifyError={vi.fn()}
      />
    </AntdProvider>,
  );

beforeEach(() => {
  mocks.departments = [
    department(),
    department({ id: 1, name: '默认部门', description: '', userCount: 1 }),
  ];
  mocks.isLoading = false;
  mocks.refetch.mockReset();
  mocks.createDepartment.mockReset().mockResolvedValue(undefined);
  mocks.updateDepartment.mockReset().mockResolvedValue(undefined);
  mocks.deleteDepartment.mockReset().mockResolvedValue(undefined);
  mocks.checkUidAvailable.mockReset().mockResolvedValue(true);
  mocks.confirm.mockReset().mockResolvedValue(true);
});

describe('部门管理表格', () => {
  it('渲染名称、描述与人数；描述为空时给占位', () => {
    renderPanel();

    expect(screen.getByText('研发部')).toBeTruthy();
    expect(screen.getByText('负责平台')).toBeTruthy();
    expect(screen.getByText('3 人')).toBeTruthy();
    // 默认部门没有描述
    expect(screen.getAllByText('-')).toHaveLength(1);
  });

  it('默认部门（id=1）禁止删除，其余可删', () => {
    renderPanel();

    expect(
      (screen.getByLabelText('删除 默认部门') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText('删除 研发部') as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('确认后按部门 id 删除', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByLabelText('删除 研发部'));

    await waitFor(() => expect(mocks.deleteDepartment).toHaveBeenCalledWith(2));
  });

  it('取消确认框就不发删除请求', async () => {
    const user = userEvent.setup();
    mocks.confirm.mockResolvedValue(false);
    renderPanel();

    await user.click(screen.getByLabelText('删除 研发部'));

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.deleteDepartment).not.toHaveBeenCalled();
  });
});

describe('创建部门', () => {
  it('弹窗带管理员字段，提交时把 UID/密码/手机号一起发出去', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /添\s*加\s*部\s*门/ }));

    expect(await screen.findByLabelText('部门名称')).toBeTruthy();
    expect(screen.getByLabelText('管理员UID')).toBeTruthy();
    expect(screen.getByLabelText('密码')).toBeTruthy();

    await user.type(screen.getByLabelText('部门名称'), '市场部');
    await user.type(screen.getByLabelText('管理员UID'), 'market_admin');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.type(screen.getByLabelText('手机号（可选）'), '15251638888');

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /确\s*定/ }));

    await waitFor(() =>
      expect(mocks.createDepartment).toHaveBeenCalledWith({
        name: '市场部',
        adminUid: 'market_admin',
        adminPassword: 'secret123',
        adminPhone: '15251638888',
      }),
    );
  });

  it('管理员 UID 失焦时预检重名', async () => {
    const user = userEvent.setup();
    mocks.checkUidAvailable.mockResolvedValue(false);
    renderPanel();

    await user.click(screen.getByRole('button', { name: /添\s*加\s*部\s*门/ }));
    await user.type(screen.getByLabelText('管理员UID'), 'taken_uid');
    await user.tab();

    expect(await screen.findByText('该UID已被使用')).toBeTruthy();
  });
});

describe('编辑部门', () => {
  it('只改名称与描述：不渲染管理员字段，且能真的提交出去', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByLabelText('编辑 研发部'));

    const name = await screen.findByLabelText('部门名称');
    expect((name as HTMLInputElement).value).toBe('研发部');
    // 编辑态没有管理员字段
    expect(screen.queryByLabelText('管理员UID')).toBeNull();
    expect(screen.queryByLabelText('密码')).toBeNull();

    await user.clear(name);
    await user.type(name, '研发部（改名）');
    const description = screen.getByLabelText('部门描述');
    await user.clear(description);
    await user.type(description, '新的描述');

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /确\s*定/ }));

    await waitFor(() =>
      expect(mocks.updateDepartment).toHaveBeenCalledWith({
        id: 2,
        input: { name: '研发部（改名）', description: '新的描述' },
      }),
    );
  });
});
