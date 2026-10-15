/**
 * 技能 api 段的契约用例。
 *
 * 重点：1) 两个列表的字段口径不同（卡片投影没有 `dir_path`、管理投影没有 `source_scope`），
 * 缺省数组与 `can_manage` 在解包处就折好；2) 个人与共享走的是不同端点（预览读文件、
 * 确认安装、删除），不能互换；3) 失败折成 `ApiError`；4) 导出是文件流，走手写层。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShareConfig } from '@/shared/lib/share-config';

const { sdk } = vi.hoisted(() => ({
  sdk: {
    listCards: vi.fn(),
    listManaged: vi.fn(),
    prepareUpload: vi.fn(),
    remoteList: vi.fn(),
    remoteSearch: vi.fn(),
    remotePrepare: vi.fn(),
    confirmShared: vi.fn(),
    confirmPersonal: vi.fn(),
    discard: vi.fn(),
    tree: vi.fn(),
    file: vi.fn(),
    personalFile: vi.fn(),
    createNode: vi.fn(),
    updateFile: vi.fn(),
    deleteNode: vi.fn(),
    dependencyOptions: vi.fn(),
    dependencies: vi.fn(),
    shareConfig: vi.fn(),
    enabled: vi.fn(),
    deleteSkill: vi.fn(),
    deletePersonal: vi.fn(),
    deleteBatch: vi.fn(),
    departments: vi.fn(),
    users: vi.fn(),
  },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  listSkillCardsRouteApiSkillsGet: (...args: unknown[]) =>
    sdk.listCards(...args),
  listSkillsRouteApiSystemSkillsGet: (...args: unknown[]) =>
    sdk.listManaged(...args),
  prepareSkillUploadRouteApiSkillsImportPreparePost: (...args: unknown[]) =>
    sdk.prepareUpload(...args),
  listRemoteSkillsRouteApiSkillsRemoteListPost: (...args: unknown[]) =>
    sdk.remoteList(...args),
  searchRemoteSkillsRouteApiSkillsRemoteSearchPost: (...args: unknown[]) =>
    sdk.remoteSearch(...args),
  prepareRemoteSkillsRouteApiSkillsRemotePreparePost: (...args: unknown[]) =>
    sdk.remotePrepare(...args),
  confirmSkillInstallDraftRouteApiSkillsInstallDraftsDraftIdConfirmPost: (
    ...args: unknown[]
  ) => sdk.confirmShared(...args),
  confirmPersonalSkillInstallDraftRouteApiSkillsPersonalInstallDraftsDraftIdConfirmPost:
    (...args: unknown[]) => sdk.confirmPersonal(...args),
  discardSkillInstallDraftRouteApiSkillsInstallDraftsDraftIdDelete: (
    ...args: unknown[]
  ) => sdk.discard(...args),
  getSkillTreeRouteApiSystemSkillsSlugTreeGet: (...args: unknown[]) =>
    sdk.tree(...args),
  getSkillFileRouteApiSystemSkillsSlugFileGet: (...args: unknown[]) =>
    sdk.file(...args),
  readPersonalSkillFileRouteApiSkillsPersonalSlugFileGet: (
    ...args: unknown[]
  ) => sdk.personalFile(...args),
  createSkillFileRouteApiSystemSkillsSlugFilePost: (...args: unknown[]) =>
    sdk.createNode(...args),
  updateSkillFileRouteApiSystemSkillsSlugFilePut: (...args: unknown[]) =>
    sdk.updateFile(...args),
  deleteSkillFileRouteApiSystemSkillsSlugFileDelete: (...args: unknown[]) =>
    sdk.deleteNode(...args),
  getSkillDependencyOptionsRouteApiSystemSkillsDependencyOptionsGet: (
    ...args: unknown[]
  ) => sdk.dependencyOptions(...args),
  updateSkillDependenciesRouteApiSystemSkillsSlugDependenciesPut: (
    ...args: unknown[]
  ) => sdk.dependencies(...args),
  updateSkillShareConfigRouteApiSystemSkillsSlugShareConfigPut: (
    ...args: unknown[]
  ) => sdk.shareConfig(...args),
  updateSkillEnabledRouteApiSystemSkillsSlugEnabledPut: (...args: unknown[]) =>
    sdk.enabled(...args),
  deleteSkillRouteApiSystemSkillsSlugDelete: (...args: unknown[]) =>
    sdk.deleteSkill(...args),
  deletePersonalSkillRouteApiSkillsPersonalSlugDelete: (...args: unknown[]) =>
    sdk.deletePersonal(...args),
  deleteSkillsBatchRouteApiSystemSkillsDeleteBatchPost: (...args: unknown[]) =>
    sdk.deleteBatch(...args),
  getDepartmentsApiDepartmentsGet: (...args: unknown[]) =>
    sdk.departments(...args),
  readUserAccessOptionsApiAuthUsersAccessOptionsGet: (...args: unknown[]) =>
    sdk.users(...args),
}));

const { skillApi } = await import('@/features/skills/api/skill-api');
const { ApiError } = await import('@/shared/api');

const ok = <T>(data: T, extra: Record<string, unknown> = {}) => ({
  data: { success: true, data, ...extra },
});

describe('技能 api 段', () => {
  beforeEach(() => {
    Object.values(sdk).forEach((mock) => mock.mockReset());
    vi.unstubAllGlobals();
  });

  it('卡片列表解包 allowed_access_levels 并补全缺失数组与 can_manage（丢掉折默认值时本用例必须失败）', async () => {
    sdk.listCards.mockResolvedValue(
      ok(
        [
          {
            id: 1,
            slug: 'a',
            name: 'A',
            description: '',
            source_type: 'upload',
            source_scope: 'shared',
          },
        ],
        { allowed_access_levels: ['global', 'department', 'user'] },
      ),
    );

    const list = await skillApi.listSkillCards();
    expect(list.allowedAccessLevels).toEqual(['global', 'department', 'user']);
    expect(list.skills[0]).toMatchObject({
      slug: 'a',
      tool_dependencies: [],
      mcp_dependencies: [],
      skill_dependencies: [],
      can_manage: false,
      is_builtin: false,
    });
  });

  it('管理投影带上 dir_path 与 share_config，缺失的 allowed_access_levels 退回 user（退回全量级别时本用例必须失败）', async () => {
    sdk.listManaged.mockResolvedValue(
      ok([
        {
          id: 5,
          slug: 'builtin-one',
          name: '内置',
          description: '',
          source_type: 'builtin',
          dir_path: 'shared/builtin-one',
          share_config: { version: 2, read_scope: { access_level: 'global' } },
          enabled: true,
          can_manage: true,
          is_builtin: true,
        },
      ]),
    );

    const list = await skillApi.listManagedSkills();
    expect(list.allowedAccessLevels).toEqual(['user']);
    expect(list.skills[0]).toMatchObject({
      dir_path: 'shared/builtin-one',
      can_manage: true,
      is_builtin: true,
      tool_dependencies: [],
    });
  });

  it('上传走 multipart，文件名原样交给后端', async () => {
    sdk.prepareUpload.mockResolvedValue(
      ok({ draft_id: 'd1', source_type: 'upload', items: [] }),
    );
    const file = new File(['# skill'], 'SKILL.md', { type: 'text/markdown' });

    await skillApi.prepareUpload(file);
    expect(sdk.prepareUpload).toHaveBeenCalledWith({ body: { file } });
  });

  it('远程列出 / 搜索 / 解析各自的请求体（把 search 的 query 传成 source 时本用例必须失败）', async () => {
    sdk.remoteList.mockResolvedValue(ok([{ name: 'a', description: '' }]));
    sdk.remoteSearch.mockResolvedValue(ok([{ source: 'o/r', name: 'a' }]));
    sdk.remotePrepare.mockResolvedValue(ok({ draft_id: 'd1', items: [] }));

    await skillApi.listRemote('owner/repo');
    expect(sdk.remoteList).toHaveBeenCalledWith({
      body: { source: 'owner/repo' },
    });

    await skillApi.searchRemote('web');
    expect(sdk.remoteSearch).toHaveBeenCalledWith({ body: { query: 'web' } });

    await skillApi.prepareRemote({ source: 'owner/repo', skills: ['a'] });
    expect(sdk.remotePrepare).toHaveBeenCalledWith({
      body: { source: 'owner/repo', skills: ['a'] },
    });
  });

  it('共享确认把 share_config 与 slugs 一起发给系统端点；个人确认只发 slugs（两条路径互换时本用例必须失败）', async () => {
    sdk.confirmShared.mockResolvedValue(ok([]));
    sdk.confirmPersonal.mockResolvedValue(ok([]));
    const shareConfig: ShareConfig = {
      version: 2,
      read_scope: { access_level: 'global', department_ids: [], user_uids: [] },
      manage_scope: null,
    };

    await skillApi.confirmSharedDraft('d1', {
      share_config: shareConfig,
      slugs: ['a'],
    });
    expect(sdk.confirmShared).toHaveBeenCalledWith({
      path: { draft_id: 'd1' },
      body: { share_config: shareConfig, slugs: ['a'] },
    });

    await skillApi.confirmPersonalDraft('d1', ['a']);
    expect(sdk.confirmPersonal).toHaveBeenCalledWith({
      path: { draft_id: 'd1' },
      body: { slugs: ['a'] },
    });
  });

  it('丢弃草稿走 DELETE 端点', async () => {
    sdk.discard.mockResolvedValue({ data: { success: true } });
    await skillApi.discardDraft('d1');
    expect(sdk.discard).toHaveBeenCalledWith({ path: { draft_id: 'd1' } });
  });

  it('个人技能读文件走个人端点，共享技能走系统端点（互换时本用例必须失败）', async () => {
    sdk.personalFile.mockResolvedValue(
      ok({ path: 'SKILL.md', content: '个人' }),
    );
    sdk.file.mockResolvedValue(ok({ path: 'SKILL.md', content: '共享' }));

    await expect(skillApi.getPersonalFile('p1', 'SKILL.md')).resolves.toEqual({
      path: 'SKILL.md',
      content: '个人',
    });
    expect(sdk.personalFile).toHaveBeenCalledWith({
      path: { slug: 'p1' },
      query: { path: 'SKILL.md' },
    });

    await skillApi.getFile('s1', 'SKILL.md');
    expect(sdk.file).toHaveBeenCalledWith({
      path: { slug: 's1' },
      query: { path: 'SKILL.md' },
    });
  });

  it('增改删文件与依赖 / 共享 / 启停的请求体字段名与后端 schema 一致', async () => {
    sdk.createNode.mockResolvedValue({ data: { success: true } });
    sdk.updateFile.mockResolvedValue({ data: { success: true } });
    sdk.deleteNode.mockResolvedValue({ data: { success: true } });
    sdk.dependencies.mockResolvedValue(ok({ slug: 's1' }));
    sdk.shareConfig.mockResolvedValue(ok({ slug: 's1' }));
    sdk.enabled.mockResolvedValue(ok({ slug: 's1', enabled: false }));

    await skillApi.createNode('s1', {
      path: 'a/b.md',
      is_dir: false,
      content: 'x',
    });
    expect(sdk.createNode).toHaveBeenCalledWith({
      path: { slug: 's1' },
      body: { path: 'a/b.md', is_dir: false, content: 'x' },
    });

    await skillApi.updateFile('s1', { path: 'a/b.md', content: 'y' });
    expect(sdk.updateFile).toHaveBeenCalledWith({
      path: { slug: 's1' },
      body: { path: 'a/b.md', content: 'y' },
    });

    await skillApi.deleteNode('s1', 'a/b.md');
    expect(sdk.deleteNode).toHaveBeenCalledWith({
      path: { slug: 's1' },
      query: { path: 'a/b.md' },
    });

    await skillApi.updateDependencies('s1', {
      tool_dependencies: ['t'],
      mcp_dependencies: ['m'],
      skill_dependencies: ['s'],
    });
    expect(sdk.dependencies).toHaveBeenCalledWith({
      path: { slug: 's1' },
      body: {
        tool_dependencies: ['t'],
        mcp_dependencies: ['m'],
        skill_dependencies: ['s'],
      },
    });

    const shareConfig: ShareConfig = {
      version: 2,
      read_scope: {
        access_level: 'user',
        department_ids: [],
        user_uids: ['u-1'],
      },
      manage_scope: null,
    };
    await skillApi.updateShareConfig('s1', shareConfig);
    expect(sdk.shareConfig).toHaveBeenCalledWith({
      path: { slug: 's1' },
      body: { share_config: shareConfig },
    });

    await skillApi.updateEnabled('s1', false);
    expect(sdk.enabled).toHaveBeenCalledWith({
      path: { slug: 's1' },
      body: { enabled: false },
    });
  });

  it('删除：共享 / 个人 / 批量各走各的端点（把个人删除发给共享端点时本用例必须失败）', async () => {
    sdk.deleteSkill.mockResolvedValue({ data: { success: true } });
    sdk.deletePersonal.mockResolvedValue({ data: { success: true } });
    sdk.deleteBatch.mockResolvedValue(
      ok([
        { slug: 'a', success: true },
        { slug: 'b', success: false, error: '内置' },
      ]),
    );

    await skillApi.deleteSkill('s1');
    expect(sdk.deleteSkill).toHaveBeenCalledWith({ path: { slug: 's1' } });

    await skillApi.deletePersonalSkill('p1');
    expect(sdk.deletePersonal).toHaveBeenCalledWith({ path: { slug: 'p1' } });

    const results = await skillApi.deleteBatch(['a', 'b']);
    expect(sdk.deleteBatch).toHaveBeenCalledWith({
      body: { slugs: ['a', 'b'] },
    });
    expect(results[1].error).toBe('内置');
  });

  it('依赖候选与共享对象列表解包', async () => {
    sdk.dependencyOptions.mockResolvedValue(
      ok({ tools: [{ slug: 't', name: '工具' }], mcps: ['m'], skills: [] }),
    );
    sdk.departments.mockResolvedValue({ data: [{ id: 1, name: '研发部' }] });
    sdk.users.mockResolvedValue({
      data: [{ uid: 'u-1', username: '张三' }],
    });

    await expect(skillApi.getDependencyOptions('s1')).resolves.toEqual({
      tools: [{ slug: 't', name: '工具' }],
      mcps: ['m'],
      skills: [],
    });
    expect(sdk.dependencyOptions).toHaveBeenCalledWith({
      query: { slug: 's1' },
    });

    await expect(skillApi.listShareTargets()).resolves.toEqual({
      departments: [{ id: 1, name: '研发部' }],
      users: [{ uid: 'u-1', username: '张三' }],
    });
  });

  it('导出走手写层拿文件流，失败折成 ApiError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('zip-bytes', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const blob = await skillApi.exportZip('s1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/skills/s1/export',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(await blob.text()).toBe('zip-bytes');

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: '技能不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(skillApi.exportZip('ghost')).rejects.toBeInstanceOf(ApiError);
  });

  it('后端失败折成带 detail 的 ApiError（把 error 当成功时本用例必须失败）', async () => {
    sdk.tree.mockResolvedValue({
      error: { detail: '技能不存在' },
      response: { status: 404 },
    });
    await expect(skillApi.getTree('ghost')).rejects.toMatchObject({
      message: '技能不存在',
      status: 404,
    });
  });
});
