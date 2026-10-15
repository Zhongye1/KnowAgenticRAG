import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sdk } = vi.hoisted(() => ({
  sdk: {
    createProjectApiProjectsPost: vi.fn(),
    listHistoryCandidatesApiProjectsHistoryCandidatesGet: vi.fn(),
    listProjectsApiProjectsGet: vi.fn(),
  },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => sdk);

const {
  createLinkedProject,
  listHistoryCandidates,
  normalizeHistoryCandidates,
  normalizeProjects,
} = await import('@/features/chat/api/projects-api');

describe('normalizeProjects', () => {
  it('只留界面用得到的字段，缺名称时退到 id', () => {
    expect(
      normalizeProjects([
        {
          id: 'a',
          name: 'Alpha',
          workdir_path: '/w/a',
          directory_mode: 'managed',
          uid: 'x',
        },
        { id: 'b' },
      ]),
    ).toEqual([
      { id: 'a', name: 'Alpha', workdirPath: '/w/a', directoryMode: 'managed' },
      { id: 'b', name: 'b', workdirPath: '', directoryMode: '' },
    ]);
  });

  it('缺 id 的条目丢掉', () => {
    expect(normalizeProjects([{ name: '没有 id' }, null, 'nope'])).toEqual([]);
  });

  it('形状不符时返回空数组', () => {
    expect(normalizeProjects(null)).toEqual([]);
    expect(normalizeProjects({ id: 'a' })).toEqual([]);
  });
});

describe('normalizeHistoryCandidates', () => {
  it('缺 thread_id 或 workdir_path 的候选丢掉', () => {
    expect(
      normalizeHistoryCandidates({
        items: [
          {
            thread_id: 't-1',
            title: '标题',
            agent_id: 'a',
            workdir_path: 'projects/x',
            updated_at: '2026-10-12T11:00:00',
          },
          { thread_id: 't-2' },
          { workdir_path: 'projects/y' },
        ],
      }),
    ).toEqual({
      items: [
        {
          threadId: 't-1',
          title: '标题',
          agentId: 'a',
          workdirPath: 'projects/x',
          updatedAt: '2026-10-12T11:00:00',
        },
      ],
      hasMore: false,
    });
  });

  it('has_more 只在明确为 true 时成立', () => {
    expect(
      normalizeHistoryCandidates({ items: [], has_more: true }).hasMore,
    ).toBe(true);
    expect(
      normalizeHistoryCandidates({ items: [], has_more: 'yes' }).hasMore,
    ).toBe(false);
  });

  it('形状不符时返回空结果', () => {
    expect(normalizeHistoryCandidates(null)).toEqual({
      items: [],
      hasMore: false,
    });
    expect(normalizeHistoryCandidates({ items: 'nope' })).toEqual({
      items: [],
      hasMore: false,
    });
  });
});

describe('createLinkedProject', () => {
  beforeEach(() => {
    for (const fn of Object.values(sdk)) fn.mockReset();
  });

  it('请求体带幂等键，linked 的路径去掉前导斜杠', async () => {
    // 契约生成物返回的是 `{data, error, response}`，`unwrap` 取 `data`
    sdk.createProjectApiProjectsPost.mockResolvedValue({
      data: {
        id: 'p-1',
        name: '项目',
        workdir_path: 'projects/x',
        directory_mode: 'linked',
      },
    });

    const project = await createLinkedProject({
      requestId: 'req-1',
      name: '项目',
      path: '/projects/x',
    });

    expect(sdk.createProjectApiProjectsPost).toHaveBeenCalledWith({
      body: {
        request_id: 'req-1',
        name: '项目',
        workdir: { mode: 'linked', path: 'projects/x' },
      },
    });
    expect(project).toEqual({
      id: 'p-1',
      name: '项目',
      workdirPath: 'projects/x',
      directoryMode: 'linked',
    });
  });

  it('创建结果没有 id 时抛错，不返回半个项目', async () => {
    sdk.createProjectApiProjectsPost.mockResolvedValue({
      data: { name: '没有 id' },
    });

    await expect(
      createLinkedProject({ requestId: 'req-2', name: '项目', path: '/a' }),
    ).rejects.toThrow('项目创建结果缺少 id');
  });
});

describe('listHistoryCandidates', () => {
  beforeEach(() => {
    for (const fn of Object.values(sdk)) fn.mockReset();
  });

  it('搜索参数名是 q，limit 默认 20', async () => {
    sdk.listHistoryCandidatesApiProjectsHistoryCandidatesGet.mockResolvedValue({
      data: { items: [] },
    });

    await listHistoryCandidates({ query: '向量' });

    expect(
      sdk.listHistoryCandidatesApiProjectsHistoryCandidatesGet,
    ).toHaveBeenCalledWith({ query: { q: '向量', limit: 20 } });
  });
});
