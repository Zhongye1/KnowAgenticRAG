/**
 * 技能面板的组件用例。
 *
 * 面板走真实的 api 段（只 mock 契约生成客户端），因此「个人技能读文件走个人端点」
 * 「批量删除只提交可删的技能」「预览失败不画成空文档」这些主张在这里被真正验证。
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 20000 });

const { sdk, notifications } = vi.hoisted(() => ({
  sdk: {
    listCards: vi.fn(),
    listManaged: vi.fn(),
    file: vi.fn(),
    personalFile: vi.fn(),
    enabled: vi.fn(),
    deleteBatch: vi.fn(),
    deleteSkill: vi.fn(),
    deletePersonal: vi.fn(),
    prepareUpload: vi.fn(),
    discard: vi.fn(),
    departments: vi.fn(),
    users: vi.fn(),
    dependencyOptions: vi.fn(),
    tree: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  listSkillCardsRouteApiSkillsGet: (...args: unknown[]) =>
    sdk.listCards(...args),
  listSkillsRouteApiSystemSkillsGet: (...args: unknown[]) =>
    sdk.listManaged(...args),
  getSkillFileRouteApiSystemSkillsSlugFileGet: (...args: unknown[]) =>
    sdk.file(...args),
  readPersonalSkillFileRouteApiSkillsPersonalSlugFileGet: (
    ...args: unknown[]
  ) => sdk.personalFile(...args),
  updateSkillEnabledRouteApiSystemSkillsSlugEnabledPut: (...args: unknown[]) =>
    sdk.enabled(...args),
  deleteSkillsBatchRouteApiSystemSkillsDeleteBatchPost: (...args: unknown[]) =>
    sdk.deleteBatch(...args),
  deleteSkillRouteApiSystemSkillsSlugDelete: (...args: unknown[]) =>
    sdk.deleteSkill(...args),
  deletePersonalSkillRouteApiSkillsPersonalSlugDelete: (...args: unknown[]) =>
    sdk.deletePersonal(...args),
  prepareSkillUploadRouteApiSkillsImportPreparePost: (...args: unknown[]) =>
    sdk.prepareUpload(...args),
  discardSkillInstallDraftRouteApiSkillsInstallDraftsDraftIdDelete: (
    ...args: unknown[]
  ) => sdk.discard(...args),
  getDepartmentsApiDepartmentsGet: (...args: unknown[]) =>
    sdk.departments(...args),
  readUserAccessOptionsApiAuthUsersAccessOptionsGet: (...args: unknown[]) =>
    sdk.users(...args),
  getSkillDependencyOptionsRouteApiSystemSkillsDependencyOptionsGet: (
    ...args: unknown[]
  ) => sdk.dependencyOptions(...args),
  getSkillTreeRouteApiSystemSkillsSlugTreeGet: (...args: unknown[]) =>
    sdk.tree(...args),
}));

vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');
  return { ...actual, useNotifications: () => notifications };
});

const { SkillCardList } = await import('@/features/skills');
const { ConfirmDialogHost } = await import('@/shared/ui/confirm-dialog-host');
const { useConfirmStore } = await import('@/shared/ui/confirm-dialog');

const card = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  slug: 'shared-one',
  name: 'shared one',
  description: '共享技能描述',
  source_type: 'remote',
  source_scope: 'shared',
  enabled: true,
  created_by: 'u-1',
  tool_dependencies: [],
  mcp_dependencies: [],
  skill_dependencies: [],
  overrides_shared: false,
  shadowed_by_personal: false,
  can_manage: true,
  effective_permission: 'manage',
  is_builtin: false,
  share_config: {
    version: 2,
    read_scope: { access_level: 'global', department_ids: [], user_uids: [] },
    manage_scope: null,
  },
  ...extra,
});

const ok = <T,>(data: T, extra: Record<string, unknown> = {}) => ({
  data: { success: true, data, ...extra },
});

const FIXTURE = [
  card({ id: 1, slug: 'shared-one', name: 'shared one' }),
  card({
    id: 2,
    slug: 'personal-one',
    name: 'personal one',
    source_type: 'personal',
    source_scope: 'personal',
    can_manage: true,
  }),
  card({
    id: 3,
    slug: 'builtin-one',
    name: 'builtin one',
    source_type: 'builtin',
    source_scope: 'builtin',
    is_builtin: true,
  }),
];

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={['/extensions?tab=skills']}>
      <QueryClientProvider client={queryClient}>
        <SkillCardList />
        <ConfirmDialogHost />
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

const cardFor = (slug: string) =>
  screen
    .getByTestId('skill-card-list')
    .querySelector(`[data-slug="${slug}"]`) as HTMLElement;

/** 卡片标题做过首字母大写，断言一律按 slug 等卡片挂载。 */
const waitForCard = (slug: string) =>
  waitFor(() => expect(cardFor(slug)).toBeTruthy());

/** 可见分组（空组不渲染，标题在 section 上）。 */
const visibleGroups = () =>
  Array.from(
    screen
      .getByTestId('skill-card-list')
      .querySelectorAll('section[data-group]'),
  ).map((node) => node.getAttribute('data-group'));

describe('技能面板', () => {
  beforeEach(() => {
    useConfirmStore.setState({ pending: null });
    notifications.addNotification.mockReset();
    Object.values(sdk).forEach((mock) => mock.mockReset());
    sdk.listCards.mockResolvedValue(ok(FIXTURE));
    sdk.enabled.mockResolvedValue(ok(card({ enabled: false })));
    sdk.deleteBatch.mockResolvedValue(
      ok([{ slug: 'shared-one', success: true }]),
    );
    sdk.deleteSkill.mockResolvedValue({ data: { success: true } });
    sdk.deletePersonal.mockResolvedValue({ data: { success: true } });
    sdk.file.mockResolvedValue(ok({ path: 'SKILL.md', content: '# 共享说明' }));
    sdk.personalFile.mockResolvedValue(
      ok({ path: 'SKILL.md', content: '# 个人说明' }),
    );
    sdk.discard.mockResolvedValue({ data: { success: true } });
    sdk.prepareUpload.mockResolvedValue(
      ok({
        draft_id: 'd1',
        source_type: 'upload',
        source: 'SKILL.md',
        items: [
          {
            slug: 'alpha',
            name: 'alpha',
            description: '新技能',
            success: true,
          },
        ],
        default_share_config: {
          version: 2,
          read_scope: {
            access_level: 'user',
            department_ids: [],
            user_uids: ['u-1'],
          },
          manage_scope: null,
        },
        allowed_access_levels: ['user'],
      }),
    );
    sdk.departments.mockResolvedValue({ data: [] });
    sdk.users.mockResolvedValue({ data: [] });
  });

  it('渲染三组卡片（个人 / 内置 / 共享），名称、slug、描述与标签都在', async () => {
    renderPanel();

    await waitForCard('shared-one');
    expect(visibleGroups()).toEqual(['personal', 'builtin', 'shared']);
    expect(within(cardFor('shared-one')).getByText('shared-one')).toBeTruthy();
    expect(
      within(cardFor('shared-one')).getByText('共享技能描述'),
    ).toBeTruthy();
    expect(within(cardFor('shared-one')).getByText('只读全局')).toBeTruthy();
    expect(within(cardFor('personal-one')).getByText('个人技能')).toBeTruthy();
  });

  it('空组隐藏：只有内置技能时不渲染个人与共享标题（去掉空组过滤时本用例必须失败）', async () => {
    sdk.listCards.mockResolvedValue(ok([FIXTURE[2]]));
    renderPanel();

    await waitForCard('builtin-one');
    expect(visibleGroups()).toEqual(['builtin']);
  });

  it('搜索命中 name / slug / description，无命中给空态（丢掉 slug 匹配时本用例必须失败）', async () => {
    renderPanel();
    await waitForCard('shared-one');

    await userEvent.type(screen.getByLabelText('搜索技能'), 'personal-one');
    await waitFor(() => expect(cardFor('shared-one')).toBeNull());
    expect(cardFor('personal-one')).toBeTruthy();

    await userEvent.clear(screen.getByLabelText('搜索技能'));
    await userEvent.type(screen.getByLabelText('搜索技能'), '没有这个');
    expect(await screen.findByText(/没有匹配的 Skill/)).toBeTruthy();
  });

  it('个人技能没有启停开关；共享技能点开关发出 PUT（把个人也渲染开关时本用例必须失败）', async () => {
    renderPanel();
    await waitForCard('shared-one');

    expect(
      within(cardFor('personal-one')).queryByRole('button', {
        name: '禁用 Skill',
      }),
    ).toBeNull();

    await userEvent.click(
      within(cardFor('shared-one')).getByRole('button', { name: '禁用 Skill' }),
    );
    await waitFor(() =>
      expect(sdk.enabled).toHaveBeenCalledWith({
        path: { slug: 'shared-one' },
        body: { enabled: false },
      }),
    );
  });

  it('预览：共享技能读系统端点、个人技能读个人端点，正文渲染 Markdown（两条路径互换时本用例必须失败）', async () => {
    renderPanel();
    await waitForCard('shared-one');

    await userEvent.click(
      within(cardFor('shared-one')).getByRole('button', { name: 'Shared One' }),
    );
    await screen.findByTestId('skill-preview-dialog');
    expect(await screen.findByText('共享说明')).toBeTruthy();
    expect(sdk.file).toHaveBeenCalledWith({
      path: { slug: 'shared-one' },
      query: { path: 'SKILL.md' },
    });

    await userEvent.click(screen.getByRole('button', { name: '关闭' }));
    await userEvent.click(
      within(cardFor('personal-one')).getByRole('button', {
        name: 'Personal One',
      }),
    );
    expect(await screen.findByText('个人说明')).toBeTruthy();
    expect(sdk.personalFile).toHaveBeenCalledWith({
      path: { slug: 'personal-one' },
      query: { path: 'SKILL.md' },
    });
  });

  it('预览读不到 SKILL.md 时给出失败原因而不是空文档（把失败吞成空串时本用例必须失败）', async () => {
    sdk.file.mockResolvedValue({
      error: { detail: '文件不存在: SKILL.md' },
      response: { status: 404 },
    });
    renderPanel();
    await waitForCard('shared-one');

    await userEvent.click(
      within(cardFor('shared-one')).getByRole('button', { name: 'Shared One' }),
    );
    expect(await screen.findByText('文件不存在: SKILL.md')).toBeTruthy();
  });

  it('内置技能不给卸载入口，共享技能的卸载走单条删除端点（内置也渲染卸载时本用例必须失败）', async () => {
    renderPanel();
    await waitForCard('builtin-one');

    await userEvent.click(
      within(cardFor('builtin-one')).getByRole('button', {
        name: 'Builtin One',
      }),
    );
    await screen.findByTestId('skill-preview-dialog');
    expect(screen.queryByRole('button', { name: '卸载' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    await userEvent.click(
      within(cardFor('shared-one')).getByRole('button', { name: 'Shared One' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: '卸载' }));
    await userEvent.click(await screen.findByRole('button', { name: '卸载' }));
    await waitFor(() =>
      expect(sdk.deleteSkill).toHaveBeenCalledWith({
        path: { slug: 'shared-one' },
      }),
    );
    expect(sdk.deletePersonal).not.toHaveBeenCalled();
  });

  it('批量管理：全选只选可删的技能，提交只带这些 slug（把内置与个人也选进来时本用例必须失败）', async () => {
    renderPanel();
    await waitForCard('shared-one');

    await userEvent.click(screen.getByRole('button', { name: '批量管理' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));
    expect(screen.getByRole('button', { name: '批量删除 (1)' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '批量删除 (1)' }));
    await userEvent.click(
      await screen.findByRole('button', { name: '确定删除' }),
    );
    await waitFor(() =>
      expect(sdk.deleteBatch).toHaveBeenCalledWith({
        body: { slugs: ['shared-one'] },
      }),
    );
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ message: '批量删除成功，已删除 1 个技能' }),
      ),
    );
  });

  it('超过后端单批上限时当场拦下并发可行动文案，不发请求', async () => {
    // 后端 delete-batch 的 max_length=50：51 个会在 pydantic 层 422
    const many = Array.from({ length: 51 }, (_, index) =>
      card({
        id: index + 1,
        slug: `bulk-${index + 1}`,
        name: `bulk ${index + 1}`,
      }),
    );
    sdk.listCards.mockResolvedValue(ok(many));
    renderPanel();
    await waitForCard('bulk-1');

    await userEvent.click(screen.getByRole('button', { name: '批量管理' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));
    await userEvent.click(
      screen.getByRole('button', { name: '批量删除 (51)' }),
    );

    // 变异：去掉 MAX_BATCH_DELETE 判定，这里会真的发出请求并拿到 422
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('一次最多删除 50 个技能'),
        }),
      ),
    );
    expect(sdk.deleteBatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '确定删除' })).toBeNull();
  });

  it('上传前先按扩展名拦下不支持的文件（拦不住时本用例必须失败）', async () => {
    renderPanel();
    await waitForCard('shared-one');

    const input = screen.getByLabelText('上传 Skill 文件');
    // accept 属性会被 user-event 默认过滤，这里模拟用户在系统对话框里选了「所有文件」
    await userEvent.upload(
      input,
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      { applyAccept: false },
    );
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '仅支持上传 .zip 文件或 SKILL.md 文件',
        }),
      ),
    );
    expect(sdk.prepareUpload).not.toHaveBeenCalled();

    await userEvent.upload(
      input,
      new File(['# skill'], 'SKILL.md', { type: 'text/markdown' }),
    );
    await waitFor(() => expect(sdk.prepareUpload).toHaveBeenCalled());
    // 解析成功后打开安装流的确认阶段
    expect(await screen.findByTestId('skill-install-flow')).toBeTruthy();
    expect(screen.getByText('确认安装内容')).toBeTruthy();
  });

  it('上传解析失败时给出后端原因，不打开安装流', async () => {
    sdk.prepareUpload.mockResolvedValue({
      error: { detail: 'ZIP 必须且只能包含一个技能（检测到一个 SKILL.md）' },
      response: { status: 400 },
    });
    renderPanel();
    await waitForCard('shared-one');

    await userEvent.upload(
      screen.getByLabelText('上传 Skill 文件'),
      new File(['x'], 'one.zip', { type: 'application/zip' }),
    );
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'ZIP 必须且只能包含一个技能（检测到一个 SKILL.md）',
        }),
      ),
    );
    expect(screen.queryByTestId('skill-install-flow')).toBeNull();
  });

  it('远程安装入口打开选择阶段（仓库页签与搜索页签都在）', async () => {
    renderPanel();
    await waitForCard('shared-one');

    await userEvent.click(screen.getByRole('button', { name: '远程安装' }));
    await screen.findByTestId('remote-picker');
    expect(screen.getByRole('tab', { name: '按仓库拉取' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '全局搜索发现' })).toBeTruthy();
    expect(screen.getByText('请先拉取仓库中的 Skill')).toBeTruthy();
  });
});
