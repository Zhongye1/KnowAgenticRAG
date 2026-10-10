/**
 * 技能详情页的导航落点用例。
 *
 * Reviewer 实测：删除技能后与两个「返回技能列表」入口都只跳到 `/extensions`，
 * 而管理员（且知识域开启）的默认 tab 是「知识库」，于是管技能的人被丢到知识库列表。
 * 落点固定为 `/extensions?tab=skills`，避免管理员被丢到扩展页的默认 tab。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 15000 });

const { sdk, notifications } = vi.hoisted(() => ({
  sdk: {
    listManaged: vi.fn(),
    tree: vi.fn(),
    file: vi.fn(),
    dependencyOptions: vi.fn(),
    remove: vi.fn(),
    exportSkill: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  listSkillsRouteApiSystemSkillsGet: (...args: unknown[]) =>
    sdk.listManaged(...args),
  getSkillTreeRouteApiSystemSkillsSlugTreeGet: (...args: unknown[]) =>
    sdk.tree(...args),
  getSkillFileRouteApiSystemSkillsSlugFileGet: (...args: unknown[]) =>
    sdk.file(...args),
  getSkillDependencyOptionsRouteApiSystemSkillsDependencyOptionsGet: (
    ...args: unknown[]
  ) => sdk.dependencyOptions(...args),
  deleteSkillRouteApiSystemSkillsSlugDelete: (...args: unknown[]) =>
    sdk.remove(...args),
  updateSkillEnabledRouteApiSystemSkillsSlugEnabledPut: vi.fn(),
  updateSkillShareConfigRouteApiSystemSkillsSlugShareConfigPut: vi.fn(),
  updateSkillDependenciesRouteApiSystemSkillsSlugDependenciesPut: vi.fn(),
  createSkillFileRouteApiSystemSkillsSlugFilePost: vi.fn(),
  updateSkillFileRouteApiSystemSkillsSlugFilePut: vi.fn(),
  deleteSkillFileRouteApiSystemSkillsSlugFileDelete: vi.fn(),
}));

vi.mock('@/shared/ui/notifications', () => ({
  useNotifications: () => notifications,
}));

const { SkillDetailPage } = await import('@/pages/skill-detail');
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query');
// 删除走命令式确认框，测试里要挂上它的渲染出口
const { ConfirmDialogHost } = await import('@/shared/ui/confirm-dialog-host');
const { useConfirmStore } = await import('@/shared/ui/confirm-dialog');

const managedSkill = (extra: Record<string, unknown> = {}) => ({
  id: 3,
  slug: 'mysql-reporter',
  name: 'Mysql Reporter',
  description: '报表',
  source_type: 'builtin',
  enabled: true,
  dir_path: 'shared/mysql-reporter',
  share_config: null,
  version: 1,
  can_manage: true,
  effective_permission: 'manage',
  is_builtin: true,
  tool_dependencies: [],
  mcp_dependencies: [],
  skill_dependencies: [],
  created_at: '',
  updated_at: '',
  ...extra,
});

const LocationProbe = () => (
  <span data-testid="path">
    {useLocation().pathname + useLocation().search}
  </span>
);

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/extensions/skill/mysql-reporter']}>
        <Routes>
          <Route path="/extensions/skill/:slug" element={<SkillDetailPage />} />
          <Route path="/extensions" element={<LocationProbe />} />
        </Routes>
        <ConfirmDialogHost />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('技能详情的导航落点', () => {
  beforeEach(() => {
    useConfirmStore.setState({ pending: null });
    notifications.addNotification.mockReset();
    sdk.listManaged
      .mockReset()
      .mockResolvedValue({ data: { success: true, data: [managedSkill()] } });
    sdk.tree
      .mockReset()
      .mockResolvedValue({ data: { success: true, data: [] } });
    sdk.file.mockReset().mockResolvedValue({
      data: { success: true, data: { path: 'SKILL.md', content: '# x' } },
    });
    sdk.dependencyOptions.mockReset().mockResolvedValue({
      data: { success: true, data: { tools: [], mcp: [], skills: [] } },
    });
    sdk.remove.mockReset().mockResolvedValue({ data: { success: true } });
  });

  it('「返回技能列表」回到技能 tab，而不是扩展页默认 tab', async () => {
    renderPage();
    const back = await screen.findByRole('link', { name: '返回技能列表' });

    // 变异：去掉 getHref('skills') 的 tab 参数，这里会断言成 /extensions
    expect(back.getAttribute('href')).toBe('/extensions?tab=skills');
  });

  it('删除成功后也回到技能 tab', async () => {
    // 内置技能没有删除入口，换成一个已安装的非内置（共享）技能
    sdk.listManaged.mockResolvedValue({
      data: {
        success: true,
        data: [managedSkill({ is_builtin: false, source_type: 'remote' })],
      },
    });
    renderPage();
    await screen.findByRole('link', { name: '返回技能列表' });

    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    await userEvent.click(
      await screen.findByRole('button', { name: '确认删除' }),
    );

    expect(await screen.findByTestId('path')).toHaveTextContent(
      '/extensions?tab=skills',
    );
  });
});
