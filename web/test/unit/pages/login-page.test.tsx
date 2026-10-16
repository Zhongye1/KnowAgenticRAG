/**
 * 登录页 UI 契约：只替换 api 段，真实跑 entities/session 的 hooks 与页面装配。
 *
 * 覆盖的对外可见结果：干净库进入初始化表单、健康检查失败进告警条、
 * 协议门禁拦住未同意的提交、423 进锁定态并禁用提交、OIDC 按 provider_name 渲染。
 *
 * 交互用 `fireEvent` 而不是 `userEvent`：antd Form 逐键触发异步校验，userEvent 的
 * 逐键 act 在 jsdom 里很贵。断言的都是最终状态，不依赖按键时序；等待用 findBy 的
 * 显式预算（与 features/chat/message-list 同口径），不放宽成「睡一会儿再断言」。
 *
 * 本文件一次渲染整页 antd 表单，本机同时跑 docker 栈与浏览器验证时单用例可能超过
 * 默认 5 秒预算（假失败），因此只提高这个文件的超时预算，不放宽任何断言。
 */
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    login: vi.fn(),
    checkFirstRun: vi.fn(),
    initializeAdmin: vi.fn(),
    getOidcConfig: vi.fn(),
    getOidcLoginUrl: vi.fn(),
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
    login: (...args: unknown[]) => api.login(...args),
    checkFirstRun: (...args: unknown[]) => api.checkFirstRun(...args),
    initializeAdmin: (...args: unknown[]) => api.initializeAdmin(...args),
    getOidcConfig: (...args: unknown[]) => api.getOidcConfig(...args),
    getOidcLoginUrl: (...args: unknown[]) => api.getOidcLoginUrl(...args),
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

const { LoginLockedError } = await import('@/entities/session');
const { LoginPage } = await import('@/pages/login');

/** antd 在两个汉字的按钮里插空格（与 KnowAgenticRAG 的 ant-design-vue 默认一致）。 */
const LOGIN_BUTTON = /登\s?录/;

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
  user_id: 1,
  uid: 'zwj',
  username: 'zwj',
  role: 'superadmin',
};

const renderLoginPage = (path = '/login') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AntdApp component={false}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>首页探针</div>} />
            <Route path="/agent" element={<div>对话页探针</div>} />
          </Routes>
        </MemoryRouter>
      </AntdApp>
    </QueryClientProvider>,
  );
};

const fillCredentials = (loginId = 'zwj', password = 'pw') => {
  fireEvent.change(screen.getByLabelText('登录账号'), {
    target: { value: loginId },
  });
  fireEvent.change(screen.getByLabelText('密码'), {
    target: { value: password },
  });
};

const submitLogin = () => {
  fireEvent.click(screen.getByRole('button', { name: LOGIN_BUTTON }));
};

describe('LoginPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    for (const fn of Object.values(api)) fn.mockReset();
    api.getCurrentUser.mockResolvedValue(null);
    api.getSystemInfo.mockResolvedValue(systemInfo);
    api.getSystemHealth.mockResolvedValue({ status: 'ok' });
    api.checkFirstRun.mockResolvedValue(false);
    api.getOidcConfig.mockResolvedValue({ enabled: false });
  });

  it('渲染后端配置的组织名与登录表单，未启用 OIDC 时不出现第三方登录区', async () => {
    renderLoginPage();

    expect(await screen.findByText('欢迎登录')).toBeInTheDocument();
    expect(await screen.findByText('KnowAgenticRAG')).toBeInTheDocument();
    // 品牌名（后端 `branding.name`）在组件里被注释掉，暂不渲染
    expect(screen.queryByText('ARS')).not.toBeInTheDocument();
    expect(screen.getByLabelText('登录账号')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: LOGIN_BUTTON }),
    ).toBeInTheDocument();
    expect(screen.queryByText('或使用以下方式登录')).not.toBeInTheDocument();
  });

  it('干净库首次进入时显示初始化超管表单', async () => {
    api.checkFirstRun.mockResolvedValue(true);
    renderLoginPage();

    expect(
      await screen.findByText('系统初始化，请创建超级管理员'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '创建管理员账户' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('登录账号')).not.toBeInTheDocument();
  });

  it('服务端健康检查失败时显示告警条，重试会重新请求', async () => {
    api.getSystemHealth.mockRejectedValueOnce(new Error('无法连接到服务端'));
    renderLoginPage();

    expect(await screen.findByText('服务端连接失败')).toBeInTheDocument();
    expect(screen.getByText('无法连接到服务端')).toBeInTheDocument();

    api.getSystemHealth.mockResolvedValue({ status: 'ok' });
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(api.getSystemHealth).toHaveBeenCalledTimes(2));
  });

  it('未勾选协议时提交被拦住，不发登录请求', async () => {
    renderLoginPage();
    await screen.findByRole('checkbox', {}, { timeout: 5_000 });

    fillCredentials();
    submitLogin();

    expect(
      await screen.findByText(
        '请先阅读并同意《用户协议》《隐私协议》',
        {},
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('勾选协议后登录成功，跳转到 redirectTo 指定的页面', async () => {
    api.login.mockResolvedValue(session);
    renderLoginPage('/login?redirectTo=%2Fagent');

    fireEvent.click(
      await screen.findByRole('checkbox', {}, { timeout: 5_000 }),
    );
    fillCredentials();
    submitLogin();

    expect(
      await screen.findByText('对话页探针', {}, { timeout: 5_000 }),
    ).toBeInTheDocument();
    // react-query 会给 mutationFn 追加 context，第二个参数不参与断言
    expect(api.login).toHaveBeenCalledWith(
      { username: 'zwj', password: 'pw' },
      expect.anything(),
    );
  });

  it('没有 redirectTo 时登录成功落到聊天页，而不是占位首页', async () => {
    api.login.mockResolvedValue(session);
    renderLoginPage();

    fireEvent.click(
      await screen.findByRole('checkbox', {}, { timeout: 5_000 }),
    );
    fillCredentials();
    submitLogin();

    expect(
      await screen.findByText('对话页探针', {}, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('首页探针')).not.toBeInTheDocument();
  });

  it('登录返回 423 时进入锁定态，提交按钮禁用并显示剩余时间', async () => {
    api.login.mockRejectedValue(
      new LoginLockedError('由于多次登录失败，账户已被锁定 300 秒', 300),
    );
    renderLoginPage();
    fireEvent.click(
      await screen.findByRole('checkbox', {}, { timeout: 5_000 }),
    );

    fillCredentials('zwj', 'wrong');
    submitLogin();

    // 倒计时每秒递减，这里只断言进入锁定态与文案形状；逐秒行为由 useLoginLock 的用例盯住
    const lockedButton = await screen.findByRole(
      'button',
      { name: /账户已锁定 \d+分\d+秒/ },
      { timeout: 5_000 },
    );
    expect(lockedButton).toBeDisabled();
    expect(
      screen.getByText(/由于多次登录失败，账户已被锁定 \d+分\d+秒/),
    ).toBeInTheDocument();
  });

  it('OIDC 启用时按 provider_name 渲染第三方登录按钮', async () => {
    api.getOidcConfig.mockResolvedValue({
      enabled: true,
      provider_name: '公司 SSO',
    });
    renderLoginPage();

    expect(
      await screen.findByRole(
        'button',
        { name: /公司 SSO/ },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
  });
});
