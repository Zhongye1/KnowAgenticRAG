/**
 * 注册页 UI 契约：只替换 api 段，真实跑 entities/session 的 hooks 与页面装配。
 *
 * 覆盖的对外可见结果：表单校验口径（UID 格式、密码长度、两次一致）、协议门禁拦住未同意的
 * 提交、成功后跳转 redirectTo、失败时把后端文案落进错误条、首启态只给说明不给表单。
 *
 * 与登录页用例同口径：交互用 `fireEvent`，等待用 `findBy` 的显式预算，只提高本文件超时。
 */
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    register: vi.fn(),
    checkFirstRun: vi.fn(),
    getCurrentUser: vi.fn(),
    getSystemInfo: vi.fn(),
    getSystemHealth: vi.fn(),
  },
}));

vi.mock('@/entities/session/api/session-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/entities/session/api/session-api')
  >('@/entities/session/api/session-api');
  return {
    ...actual,
    register: (...args: unknown[]) => api.register(...args),
    checkFirstRun: (...args: unknown[]) => api.checkFirstRun(...args),
    getCurrentUser: (...args: unknown[]) => api.getCurrentUser(...args),
  };
});

vi.mock('@/entities/session/api/system-info-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/entities/session/api/system-info-api')
  >('@/entities/session/api/system-info-api');
  return {
    ...actual,
    getSystemInfo: (...args: unknown[]) => api.getSystemInfo(...args),
    getSystemHealth: (...args: unknown[]) => api.getSystemHealth(...args),
  };
});

vi.setConfig({ testTimeout: 20_000 });

const { RegisterPage } = await import('@/pages/register');

const systemInfo = {
  organization: {
    name: 'KnowAgenticRAG',
    logo: '/favicon.svg',
    login_bg: '/login-bg.jpg',
  },
  branding: { name: 'ARS' },
  footer: {
    copyright: '© KnowAgenticRAG 2026 v0.7.2',
    user_agreement_url: '/protocols/user-agreement.template.html',
    privacy_policy_url: '/protocols/privacy-policy.template.html',
  },
};

const session = {
  access_token: 'ars.token',
  token_type: 'bearer',
  user_id: 7,
  uid: 'newcomer',
  username: 'newcomer',
  role: 'user',
};

const renderRegisterPage = (path = '/register') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AntdApp component={false}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<div>登录页探针</div>} />
            <Route path="/agent" element={<div>对话页探针</div>} />
          </Routes>
        </MemoryRouter>
      </AntdApp>
    </QueryClientProvider>,
  );
};

const fillForm = ({
  uid = 'newcomer',
  password = 'passw0rd123',
  confirm = 'passw0rd123',
  phone = '',
} = {}) => {
  fireEvent.change(screen.getByLabelText('UID'), { target: { value: uid } });
  fireEvent.change(screen.getByLabelText('密码'), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText('确认密码'), {
    target: { value: confirm },
  });
  if (phone) {
    fireEvent.change(screen.getByLabelText('手机号（可选）'), {
      target: { value: phone },
    });
  }
};

const acceptAgreement = async () => {
  fireEvent.click(await screen.findByRole('checkbox', {}, { timeout: 5_000 }));
};

const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: /注\s?册/ }));
};

describe('RegisterPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    for (const fn of Object.values(api)) fn.mockReset();
    api.getCurrentUser.mockResolvedValue(null);
    api.getSystemInfo.mockResolvedValue(systemInfo);
    api.getSystemHealth.mockResolvedValue({ status: 'ok' });
    api.checkFirstRun.mockResolvedValue(false);
  });

  it('渲染注册表单与回登录页的入口', async () => {
    renderRegisterPage();

    expect(await screen.findByText('注册账号')).toBeInTheDocument();
    expect(screen.getByLabelText('UID')).toBeInTheDocument();
    expect(screen.getByLabelText('手机号（可选）')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认密码')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '登录' })).toBeInTheDocument();
  });

  it('未勾选协议时提交被拦住，不发注册请求', async () => {
    renderRegisterPage();
    await screen.findByRole('checkbox', {}, { timeout: 5_000 });

    fillForm();
    submit();

    expect(
      await screen.findByText(
        '请先阅读并同意《用户协议》《隐私协议》',
        {},
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('UID 格式与密码长度按后端口径在前端先拦', async () => {
    renderRegisterPage();
    await acceptAgreement();

    fillForm({ uid: 'ab' });
    submit();
    expect(
      await screen.findByText('UID长度必须在3-20个字符之间'),
    ).toBeInTheDocument();

    fillForm({ uid: 'newcomer', password: 'short', confirm: 'short' });
    submit();
    expect(
      await screen.findByText('密码至少需要 8 个字符'),
    ).toBeInTheDocument();

    fillForm({ password: 'passw0rd123', confirm: 'passw0rd124' });
    submit();
    expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument();

    expect(api.register).not.toHaveBeenCalled();
  });

  it('注册成功后落到 redirectTo，并把手机号空串折成 null', async () => {
    api.register.mockResolvedValue(session);
    renderRegisterPage('/register?redirectTo=%2Fagent');

    await acceptAgreement();
    fillForm();
    submit();

    expect(
      await screen.findByText('对话页探针', {}, { timeout: 5_000 }),
    ).toBeInTheDocument();
    // mutationFn 是箭头函数，react-query 不会把 context 透传给被 mock 的 api 段
    expect(api.register).toHaveBeenCalledWith({
      uid: 'newcomer',
      password: 'passw0rd123',
      phone_number: null,
    });
  });

  it('注册失败时把后端文案落进错误条', async () => {
    api.register.mockRejectedValue(new Error('该用户ID已被占用'));
    renderRegisterPage();

    await acceptAgreement();
    fillForm();
    submit();

    expect(
      await screen.findByText('该用户ID已被占用', {}, { timeout: 5_000 }),
    ).toBeInTheDocument();
  });

  it('系统未初始化时不给表单，只给创建超管的入口', async () => {
    api.checkFirstRun.mockResolvedValue(true);
    renderRegisterPage();

    expect(
      await screen.findByText('系统尚未初始化，请先', { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '创建超级管理员' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('UID')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /注\s?册/ })).not.toBeInTheDocument();
  });
});
