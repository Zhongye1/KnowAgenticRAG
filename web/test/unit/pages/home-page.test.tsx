/**
 * 首页 UI 契约：静态展示页。
 *
 * 覆盖五段文案锚点、顶栏按登录态给出的入口、hero 的粒子画布与阶段条、任务链段的
 * 切换，以及「页面不读后端」这条负向契约（只有会话查询会发请求）。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DOCS_URL, REPO_URL } from '@/shared/config';

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

/**
 * 品牌标只影响图形，用例不断言图标；这里整体换成空组件。真实图标走
 * `@lobehub/icons`，其依赖链里的 `@emoji-mart/data` JSON 在 Node ESM 下加载会直接
 * 让用例文件起不来（见 lib/brand-logos.ts 的说明）。品牌标的实际渲染由浏览器实测覆盖。
 */
const Logo = () => null;

vi.mock('@/pages/home/lib/brand-logos', () => ({
  Claude: Logo,
  DeepSeek: Logo,
  Dify: Logo,
  Gemini: Logo,
  Github: Logo,
  Hunyuan: Logo,
  Kimi: Logo,
  MCP: Logo,
  Minimax: Logo,
  Notion: Logo,
  Ollama: Logo,
  OpenAI: Logo,
  Qwen: Logo,
  Volcengine: Logo,
  Zhipu: Logo,
}));

const { HomePage } = await import('@/pages/home');

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

/**
 * GitHub 公开 API 的替身：hero 的 GitHub 入口挂载后会取一次 star 数，用例不打真实网络。
 * 默认返回 2xx 与一个数字，负向用例自己改成失败或非 2xx。
 */
const fetchMock = vi.fn();

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
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ stargazers_count: 135 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('静态页不请求系统信息与健康检查', async () => {
    renderHomePage();
    await screen.findByText('有据可依');

    expect(api.getSystemHealth).not.toHaveBeenCalled();
    expect(api.getSystemInfo).not.toHaveBeenCalled();
    // 唯一的网络请求是 hero 取 star 数的 GitHub 公开 API，没有指向本后端的调用
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.github\.com\//);
    }
  });

  it('hero 的 GitHub 入口指向仓库，star 数来自该仓库的公开 API', async () => {
    const { container } = renderHomePage();
    await screen.findByText('有据可依');

    const link = within(container.querySelector('#hero') as HTMLElement).getByRole(
      'link',
      { name: /GitHub/ },
    );
    expect(link).toHaveAttribute('href', REPO_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(await within(link).findByText('135')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/Zhongye1/KnowAgenticRAG',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('star 数取不到时只留 GitHub 入口，不显示数字', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const { container } = renderHomePage();
    await screen.findByText('有据可依');

    const link = within(container.querySelector('#hero') as HTMLElement).getByRole(
      'link',
      { name: /GitHub/ },
    );
    expect(link).toHaveAttribute('href', REPO_URL);
    expect(link.textContent).not.toMatch(/\d/);
  });

  it('五段结构就位：段头、链路三步、流程五步、三列与页脚', async () => {
    const { container } = renderHomePage();
    await screen.findByText('有据可依');

    // hero：品牌标题 + 链路三步
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '让智能工作有据可依',
    );
    const stages = within(screen.getByRole('list', { name: 'RAG 链路阶段' }));
    expect(stages.getAllByRole('listitem')).toHaveLength(3);

    // 每段都有自己的段头与眉标；四个内容段的编号按文档顺序 01~04
    const bands = Array.from(
      container.querySelectorAll('main > section'),
    ).filter((band) => band.id !== 'hero');
    expect(bands).toHaveLength(5);
    bands.forEach((band, index) => {
      expect(within(band as HTMLElement).getAllByRole('heading').length).toBeGreaterThan(0);
      expect(
        within(band as HTMLElement).getByText(
          new RegExp(`^0${index + 1} / `),
        ),
      ).toBeInTheDocument();
    });

    // RAG 流程五步：每步一个标题 + 一个箭头链
    const steps = container.querySelectorAll('#rag-pipeline .pipe-step');
    expect(steps).toHaveLength(5);
    for (const step of steps) {
      expect(step.querySelector('h3')?.textContent).toBeTruthy();
      expect(step.querySelector('svg')).not.toBeNull();
    }

    // 知识工作段六块各有截图图位与入口；集成段三列与厂商条
    const pillars = container.querySelectorAll('#knowledge-work .pillar');
    expect(pillars).toHaveLength(6);
    const shots: string[] = [];
    for (const pillar of pillars) {
      const shot = pillar.querySelector('img');
      expect(shot).not.toBeNull();
      // 图位是真截图而不是占位块：src 指向 home 资源，alt 不缺
      expect(shot?.getAttribute('src')).toMatch(/^\/assets\/home\/02-[1-6]\.png$/);
      expect(shot?.getAttribute('alt')).toBeTruthy();
      expect(pillar.querySelector('[data-placeholder]')).toBeNull();
      shots.push(shot?.getAttribute('src') ?? '');
      expect(pillar.querySelector('a')).not.toBeNull();
    }
    // 六块各用一张，不重复
    expect(new Set(shots).size).toBe(6);
    expect(
      container.querySelectorAll('#integration .home-cols > *'),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll('#integration .vendor-list > li'),
    ).toHaveLength(12);

    // 页脚：品牌名 + 文档站与仓库两个入口，没有版权行
    const footer = container.querySelector('.home-footer') as HTMLElement;
    expect(within(footer).getByText('KnowAgenticRAG')).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: '文档' })).toHaveAttribute(
      'href',
      `${DOCS_URL}intro/project-overview`,
    );
    expect(within(footer).getByRole('link', { name: /GitHub/ })).toHaveAttribute(
      'href',
      REPO_URL,
    );
  });

  it('hero 里的粒子画布排在文案之后', async () => {
    const { container } = renderHomePage();
    await screen.findByText('有据可依');

    const atlas = container.querySelector('.hero-atlas');
    expect(atlas).not.toBeNull();
    expect(atlas?.querySelector('canvas')).not.toBeNull();
    expect(atlas?.previousElementSibling).toHaveClass('hero-copy');
  });

  it('任务链段切换后，选项卡状态、面板指向与图源一起变', async () => {
    renderHomePage();
    // 默认停在第二条：选项卡状态、面板指向与图源一致
    const tabs = await screen.findAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    // 图源只在任务链的 tabpanel 里取：知识工作段那六块也各自渲染一张截图
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('img')).toHaveAttribute(
      'src',
      '/assets/home/1-2.png',
    );

    // 点最后一条：状态、面板指向与图源一起换
    fireEvent.click(tabs[3]);

    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'task-chain-tab-3',
    );
    expect(within(screen.getByRole('tabpanel')).getByRole('img')).toHaveAttribute(
      'src',
      '/assets/home/1-4.png',
    );
  });

  it('每个并排网格的子元素数与它声明的轨道数一致', async () => {
    const { container } = renderHomePage();
    await screen.findByRole('heading', { name: '数据源与工具集成' });

    // 网格声明三条轨道，子元素就必须正好三个，否则会留下一条空轨道把内容挤窄
    expect(container.querySelectorAll('#integration .home-cols > *')).toHaveLength(3);
    // 任务链段是「环节列表 + 截图卡」两列
    expect(container.querySelectorAll('#task-chain .home-cols > *')).toHaveLength(
      2,
    );
  });

  it('未登录时顶栏给登录入口，并带上回到首页的回跳参数', async () => {
    renderHomePage();
    await screen.findByText('有据可依');

    fireEvent.click(screen.getByRole('link', { name: '登录' }));

    expect(
      await screen.findByText('登录页:/login?redirectTo=%2F'),
    ).toBeInTheDocument();
  });

  it('已登录时顶栏给进入控制台入口', async () => {
    api.getCurrentUser.mockResolvedValue(currentUser);
    renderHomePage();
    await screen.findByText('有据可依');

    const consoleLink = await screen.findByRole('link', {
      name: '进入控制台',
    });
    expect(consoleLink).toHaveAttribute('href', '/agent');
  });
});
