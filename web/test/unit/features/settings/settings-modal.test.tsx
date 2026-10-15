import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AntdProvider } from '@/app/theme/antd-provider';

/**
 * 设置外壳的角色门禁与导航顺序。
 *
 * 分区本体各自有用例，这里只验证：按角色出现哪些导航项、顺序与桌面端一致、打开时落在
 * 账户设置、点击导航切换到对应分区。
 */
const mocks = vi.hoisted(() => ({
  isAdmin: false,
  isSuperuser: false,
}));

vi.mock('@/entities/session', () => ({
  useIsAdmin: () => mocks.isAdmin,
  useIsSuperuser: () => mocks.isSuperuser,
}));

vi.mock('@/features/account-settings/@x/settings', () => ({
  AccountSection: () => <div>账户设置分区</div>,
}));
vi.mock('@/features/api-keys/@x/settings', () => ({
  ApiKeysPanel: () => <div>API Keys 分区</div>,
}));
vi.mock('@/features/agent-env/@x/settings', () => ({
  AgentEnvPanel: () => <div>环境变量分区</div>,
}));
vi.mock('@/features/basic-settings/@x/settings', () => ({
  BasicSettingsPanel: () => <div>基本设置分区</div>,
}));
vi.mock('@/features/ocr-settings/@x/settings', () => ({
  OcrSettingsPanel: () => <div>OCR 配置分区</div>,
}));
vi.mock('@/features/user-management/@x/settings', () => ({
  UserManagementPanel: () => <div>用户管理分区</div>,
}));
vi.mock('@/features/department-management/@x/settings', () => ({
  DepartmentManagementPanel: () => <div>部门管理分区</div>,
}));

const { SettingsModal } = await import('@/features/settings');

const renderShell = () =>
  render(
    <AntdProvider>
      <SettingsModal
        open
        onOpenChange={vi.fn()}
        notifySuccess={vi.fn()}
        notifyError={vi.fn()}
      />
    </AntdProvider>,
  );

const navLabels = (): string[] =>
  within(screen.getByRole('navigation', { name: '设置分区' }))
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');

beforeEach(() => {
  mocks.isAdmin = false;
  mocks.isSuperuser = false;
});

describe('导航项按角色出现', () => {
  it('普通用户只有三项', () => {
    renderShell();

    expect(navLabels()).toEqual(['账户设置', 'API Keys', '环境变量']);
  });

  it('管理员多出基本设置、OCR 配置与用户管理，但没有部门管理', () => {
    mocks.isAdmin = true;
    renderShell();

    expect(navLabels()).toEqual([
      '账户设置',
      'API Keys',
      '基本设置',
      'OCR 配置',
      '用户管理',
      '环境变量',
    ]);
  });

  it('超管再多一项部门管理，且环境变量排在最后（与参照桌面端同序）', () => {
    mocks.isAdmin = true;
    mocks.isSuperuser = true;
    renderShell();

    expect(navLabels()).toEqual([
      '账户设置',
      'API Keys',
      '基本设置',
      'OCR 配置',
      '用户管理',
      '部门管理',
      '环境变量',
    ]);
  });
});

describe('默认分区与切换', () => {
  it('打开时落在账户设置', () => {
    mocks.isAdmin = true;
    mocks.isSuperuser = true;
    renderShell();

    expect(screen.getByText('账户设置分区')).toBeTruthy();
    expect(screen.queryByText('部门管理分区')).toBeNull();
  });

  it('点击导航切换到对应分区', async () => {
    const user = userEvent.setup();
    mocks.isAdmin = true;
    mocks.isSuperuser = true;
    renderShell();

    await user.click(screen.getByRole('button', { name: '部门管理' }));

    expect(screen.getByText('部门管理分区')).toBeTruthy();
    expect(screen.queryByText('账户设置分区')).toBeNull();
  });

  it('普通用户看不到受门控的分区，也没有对应按钮可点', () => {
    renderShell();

    expect(screen.queryByRole('button', { name: '基本设置' })).toBeNull();
    expect(screen.queryByRole('button', { name: '部门管理' })).toBeNull();
  });
});
