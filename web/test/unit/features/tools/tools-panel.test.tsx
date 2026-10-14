import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AntdProvider } from '@/app/theme/antd-provider';
import type { Tool } from '@/entities/tool';

/**
 * 工具面板：渲染真实组件，只把实体层换成桩。
 *
 * 覆盖卡片渲染、搜索、分类筛选与详情弹窗（描述 / 配置说明 / 分类 / 标签 / 参数表）。
 */
const mocks = vi.hoisted(() => ({
  tools: [] as Tool[],
  isLoading: false,
  error: null as unknown,
  refetch: vi.fn(),
}));

vi.mock('@/entities/tool', () => ({
  useTools: () => ({
    tools: mocks.tools,
    isLoading: mocks.isLoading,
    isFetching: false,
    error: mocks.error,
    refetch: mocks.refetch,
  }),
}));

const { ToolsPanel } = await import('@/features/tools');

const tool = (overrides: Partial<Tool> = {}): Tool => ({
  slug: 'web_search',
  name: '联网搜索',
  description: '搜索互联网',
  category: 'buildin',
  tags: [],
  configGuide: '',
  args: [],
  ...overrides,
});

const renderPanel = () =>
  render(
    <AntdProvider>
      <ToolsPanel />
    </AntdProvider>,
  );

beforeEach(() => {
  mocks.tools = [
    tool({ slug: 'web_search', name: '联网搜索' }),
    tool({
      slug: 'mysql_query',
      name: 'MySQL 查询',
      description: '执行只读 SQL',
      category: 'mysql',
      tags: ['数据库'],
      configGuide: '需要配置 MySQL 连接',
      args: [
        { name: 'sql', type: 'string', description: '只读 SQL' },
        { name: 'limit', type: 'integer', description: '' },
      ],
    }),
  ];
  mocks.isLoading = false;
  mocks.error = null;
  mocks.refetch.mockReset();
});

describe('工具卡片', () => {
  it('渲染标题、slug 与描述', () => {
    renderPanel();

    expect(screen.getByText('联网搜索')).toBeTruthy();
    expect(screen.getByText('web_search')).toBeTruthy();
    expect(screen.getByText('执行只读 SQL')).toBeTruthy();
  });

  it('标题按参照格式化：分隔符折空格、逐词首字母大写', () => {
    mocks.tools = [tool({ slug: 'mysql_query', name: 'mysql_query' })];
    renderPanel();

    expect(screen.getByText('Mysql Query')).toBeTruthy();
  });

  it('加载中给加载态', () => {
    mocks.isLoading = true;
    mocks.tools = [];
    renderPanel();

    expect(screen.getByText('正在加载工具…')).toBeTruthy();
  });

  it('加载失败给后端文案与重试', async () => {
    const user = userEvent.setup();
    mocks.error = new Error('加载工具失败');
    renderPanel();

    expect(screen.getByRole('alert').textContent).toBe('加载工具失败');
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(mocks.refetch).toHaveBeenCalled();
  });
});

describe('搜索与筛选', () => {
  it('搜索按名称过滤', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('搜索工具'), 'mysql');

    expect(screen.queryByText('联网搜索')).toBeNull();
    // 标题按参照格式化：MySQL → Mysql（只有 2–3 字全大写词原样保留）
    expect(screen.getByText('Mysql 查询')).toBeTruthy();
  });

  it('分类下拉从数据推导，选中后只剩该分类', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('combobox', { name: '按分类筛选' }));

    // 卡片上的分类标签与下拉项同名，断言要限定在下拉容器里
    const dropdown = document.querySelector('.ant-select-dropdown');
    if (!(dropdown instanceof HTMLElement)) throw new Error('下拉未渲染');
    const optionTexts = within(dropdown)
      .getAllByText(/^(全部分类|内置工具|MySQL|调试)$/)
      .map((node) => node.textContent);
    // 只有「全部」+ 数据里出现过的两个分类，没有写死的「调试」
    expect(optionTexts).toEqual(['全部分类', '内置工具', 'MySQL']);

    await user.click(within(dropdown).getByText('内置工具'));

    expect(screen.getByText('联网搜索')).toBeTruthy();
    expect(screen.queryByText('Mysql 查询')).toBeNull();
  });

  it('筛选无命中时给匹配空态', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('搜索工具'), 'zzz');

    expect(
      screen.getByText('无匹配工具。换个关键词或清空筛选试试。'),
    ).toBeTruthy();
  });
});

describe('详情弹窗', () => {
  it('点卡片打开详情：描述、配置说明、分类、标签与参数表', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('Mysql 查询'));

    // 弹窗标题用原始名称，卡片标题用格式化后的名称
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('MySQL 查询')).toBeTruthy();
    expect(within(dialog).getByText('执行只读 SQL')).toBeTruthy();
    expect(within(dialog).getByText('需要配置 MySQL 连接')).toBeTruthy();
    expect(within(dialog).getByText('MySQL')).toBeTruthy();
    expect(within(dialog).getByText('数据库')).toBeTruthy();

    const rows = within(dialog).getAllByRole('row');
    // 表头 + 两行参数
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('sql')).toBeTruthy();
    expect(within(rows[2]).getByText('limit')).toBeTruthy();
    // 缺类型时给 any
    expect(within(rows[1]).getByText('string')).toBeTruthy();
  });

  it('没有参数的工具有详情但不渲染参数表', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('联网搜索'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText('参数')).toBeNull();
    expect(within(dialog).getByText('无')).toBeTruthy();
  });
});
