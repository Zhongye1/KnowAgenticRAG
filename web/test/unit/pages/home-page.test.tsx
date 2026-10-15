/**
 * 首页 UI 契约：只替换 api 段，真实跑 entities/session 的 hooks 与页面装配。
 *
 * 覆盖三态、配置加载门禁（健康检查失败不发配置请求）、照搬的正文文案，
 * 以及顶栏按登录态给出的入口。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    getSystemHealth: vi.fn(),
    getSystemInfo: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

vi.mock('@/entities/session/api/system-info-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/entities/session/api/system-info-api')
  >('@/entities/session/api/system-info-api');
  return {
    ...actual,
    getSystemHealth: (...args: unknown[]) => api.getSystemHealth(...args),
    getSystemInfo: (...args: unknown[]) => api.getSystemInfo(...args),
  };
});

vi.mock('@/entities/session/api/session-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/entities/session/api/session-api')
  >('@/entities/session/api/session-api');
  return {
    ...actual,
    getCurrentUser: (...args: unknown[]) => api.getCurrentUser(...args),
  };
});

const { HomePage } = await import('@/pages/home');

const systemInfo = {
  organization: { name: 'KnowAgenticRAG', logo: '/favicon.svg' },
  branding: { name: 'KnowAgenticRAG' },
  footer: { copyright: '© KnowAgenticRAG 2026 v0.7.2' },
};

const currentUser = {
  id: 1,
  uid: 'zy',
  username: 'zy',
  phone_number: null,
  avatar: null,
  role: 'superadmin',
  department_id: null,
  department_name: null,
  created_at: '2026-10-11T00:00:00Z',
  last_login: null,
};

/** 落点探针：把当前 pathname + search 打进 DOM，供断言顶栏入口的跳转目标。 */
const RouteProbe = ({ label }: { label: string }) => {
  const location = useLocation();
  return <div>{`${label}:${location.pathname}${location.search}`}</div>;
};

const renderHomePage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<RouteProbe label="登录页" />} />
          <Route path="/agent" element={<RouteProbe label="对话页" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('HomePage', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.getCurrentUser.mockResolvedValue(null);
    api.getSystemInfo.mockResolvedValue(systemInfo);
    api.getSystemHealth.mockResolvedValue({ status: 'ok' });
  });

  it('健康检查进行中显示连接态', () => {
    api.getSystemHealth.mockReturnValue(new Promise(() => {}));
    renderHomePage();

    expect(screen.getByText('正在连接服务...')).toBeInTheDocument();
  });

  it('健康检查失败进错误态，且不加载配置', async () => {
    api.getSystemHealth.mockRejectedValue(new Error('后端服务无法响应'));
    renderHomePage();

    expect(await screen.findByText('服务连接失败')).toBeInTheDocument();
    expect(screen.getByText('后端服务无法响应')).toBeInTheDocument();
    expect(api.getSystemInfo).not.toHaveBeenCalled();
  });

  it('错误态点重试后恢复，并在这时才开始加载配置', async () => {
    api.getSystemHealth.mockRejectedValueOnce(new Error('后端服务无法响应'));
    renderHomePage();
    await screen.findByText('服务连接失败');

    api.getSystemHealth.mockResolvedValue({ status: 'ok' });
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByText('Data structure')).toBeInTheDocument();
    await waitFor(() => expect(api.getSystemInfo).toHaveBeenCalledTimes(1));
  });

  it('正常态渲染照搬的正文文案与配置来的品牌栏', async () => {
    renderHomePage();

    // hero：标题的 matrix 强调词与描述
    expect(await screen.findByText('intelligent')).toBeInTheDocument();
    expect(
      screen.getByText(/We turn open data into structured/),
    ).toBeInTheDocument();

    // 指标条、接口段、能力段、页脚各取一处锚点
    expect(screen.getByText('Data structure')).toBeInTheDocument();
    expect(screen.getByText('Agent Runtime')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Discover and retrieve records across supported datasets',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('© 2026 Ausdata Science Pty Ltd'),
    ).toBeInTheDocument();

    // 品牌栏来自系统信息
    expect(screen.getByText('KnowAgenticRAG')).toBeInTheDocument();
    expect(screen.queryByText('正在连接服务...')).not.toBeInTheDocument();
  });

  it('接口段接上接入面板，上下文段留出表单位置', async () => {
    const { container } = renderHomePage();
    await screen.findByText('Agent Runtime');

    // 接入面板的默认标签与 API 标签里的本仓事实
    expect(screen.getByText('MCP Server Gateway')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'API' }));
    expect(
      screen.getByText('Authorization: Bearer arskey_…'),
    ).toBeInTheDocument();

    // 上下文段：标题与显式的占位块（占位换成真实入口时改这条）
    expect(screen.getByText('A practical platform')).toBeInTheDocument();
    expect(
      container.querySelector('[data-context-placeholder]'),
    ).not.toBeNull();
  });

  it('hero 里的 3D 数据图渲染成粒子画布，排在文案右侧', async () => {
    const { container } = renderHomePage();
    await screen.findByText('intelligent');

    const atlas = container.querySelector('.hero-atlas');
    expect(atlas).not.toBeNull();
    // 与文案同属 .hero-grid 这一行，且紧跟在文案之后
    expect(atlas?.parentElement).toHaveClass('hero-grid');
    expect(atlas?.previousElementSibling).toHaveClass('hero-copy');
    expect(atlas?.querySelector('canvas')).not.toBeNull();
  });

  it('未登录时顶栏给登录入口，并带上回到首页的回跳参数', async () => {
    renderHomePage();
    await screen.findByText('Data structure');

    fireEvent.click(screen.getByRole('link', { name: '登录' }));

    expect(
      await screen.findByText('登录页:/login?redirectTo=%2F'),
    ).toBeInTheDocument();
  });

  it('已登录时顶栏给进入控制台入口', async () => {
    api.getCurrentUser.mockResolvedValue(currentUser);
    renderHomePage();
    await screen.findByText('Data structure');

    const consoleLink = await screen.findByRole('link', {
      name: '进入控制台',
    });
    expect(consoleLink).toHaveAttribute('href', '/agent');
  });
});
