/**
 * 导图接口层：调用形态（path/body）与折叠规则（envelope、缺字段、错误）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), generate: vi.fn(), diff: vi.fn() },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getDatabaseMindmapApiKnowledgeDatabasesKbIdMindmapGet: (...args: unknown[]) =>
    api.get(...args),
  generateMindmapApiKnowledgeDatabasesKbIdMindmapGeneratePost: (
    ...args: unknown[]
  ) => api.generate(...args),
  getMindmapDiffRouteApiKnowledgeDatabasesKbIdMindmapDiffGet: (
    ...args: unknown[]
  ) => api.diff(...args),
}));

const { mindmapApi } =
  await import('@/features/knowledge-base/api/mindmap-api');

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('取导图', () => {
  it('返回 mindmap 为 null 时算「还没生成」，不是错误', async () => {
    api.get.mockResolvedValue({
      data: { message: 'success', mindmap: null, kb_id: 'kb-1' },
      error: undefined,
    });

    await expect(mindmapApi.getDocument('kb-1')).resolves.toMatchObject({
      mindmap: null,
      kb_id: 'kb-1',
    });
    expect(api.get).toHaveBeenCalledWith({ path: { kb_id: 'kb-1' } });
  });

  it('缺 kb_id 时回落到入参（响应被截断也不至于丢主键）', async () => {
    api.get.mockResolvedValue({ data: { mindmap: null }, error: undefined });

    await expect(mindmapApi.getDocument('kb-1')).resolves.toMatchObject({
      kb_id: 'kb-1',
    });
  });

  it('404 照常抛出，不伪装成空态', async () => {
    api.get.mockResolvedValue({
      data: undefined,
      error: { detail: '知识库 kb-1 不存在' },
      response: { status: 404 },
    });

    await expect(mindmapApi.getDocument('kb-1')).rejects.toThrow(
      '知识库 kb-1 不存在',
    );
  });
});

describe('生成导图', () => {
  it('默认提交全部文件、非增量', async () => {
    api.generate.mockResolvedValue({
      data: { mindmap: { content: '根' } },
      error: undefined,
    });

    await expect(mindmapApi.generate('kb-1')).resolves.toMatchObject({
      mindmap: { content: '根' },
    });
    expect(api.generate).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { file_ids: [], user_prompt: '', incremental: false },
    });
  });

  it('增量更新带上 incremental 与自定义提示词，并把 no_ai_needed 透出来', async () => {
    api.generate.mockResolvedValue({
      data: { mindmap: { content: '根' }, no_ai_needed: true },
      error: undefined,
    });

    await expect(
      mindmapApi.generate('kb-1', {
        incremental: true,
        userPrompt: '按主题分',
      }),
    ).resolves.toMatchObject({ no_ai_needed: true });
    expect(api.generate).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { file_ids: [], user_prompt: '按主题分', incremental: true },
    });
  });

  it('失败时抛后端原因', async () => {
    api.generate.mockResolvedValue({
      data: undefined,
      error: { detail: '知识库中还没有文件' },
      response: { status: 400 },
    });

    await expect(mindmapApi.generate('kb-1')).rejects.toThrow(
      '知识库中还没有文件',
    );
  });
});

describe('差异检测', () => {
  it('原样返回后端的差异结构', async () => {
    api.diff.mockResolvedValue({
      data: {
        has_mindmap: true,
        tracked_files: ['f-1'],
        current_files: ['f-1', 'f-2'],
        added_files: [{ file_id: 'f-2', filename: 'b.md' }],
        removed_file_ids: [],
        unchanged_count: 1,
        needs_update: true,
      },
      error: undefined,
    });

    const diff = await mindmapApi.getDiff('kb-1');

    expect(diff.needs_update).toBe(true);
    expect(diff.added_files).toHaveLength(1);
    expect(api.diff).toHaveBeenCalledWith({ path: { kb_id: 'kb-1' } });
  });
});
