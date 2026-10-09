/**
 * 图谱接口层：调用形态（query/body）与折叠规则（envelope、业务状态、缺字段）。
 *
 * 生成客户端在这里被替换成 spy，断言的是本层真正发出去的参数，不是后端行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    subgraph: vi.fn(),
    status: vi.fn(),
    configure: vi.fn(),
    index: vi.fn(),
    reset: vi.fn(),
    reconcile: vi.fn(),
    failedChunks: vi.fn(),
  },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  getSubgraphApiGraphSubgraphGet: (...args: unknown[]) => api.subgraph(...args),
  getGraphBuildStatusApiKnowledgeDatabasesKbIdGraphBuildStatusGet: (
    ...args: unknown[]
  ) => api.status(...args),
  configureGraphBuildApiKnowledgeDatabasesKbIdGraphBuildConfigPost: (
    ...args: unknown[]
  ) => api.configure(...args),
  indexGraphBuildApiKnowledgeDatabasesKbIdGraphBuildIndexPost: (
    ...args: unknown[]
  ) => api.index(...args),
  resetGraphBuildApiKnowledgeDatabasesKbIdGraphBuildResetPost: (
    ...args: unknown[]
  ) => api.reset(...args),
  reconcileGraphBuildApiKnowledgeDatabasesKbIdGraphBuildReconcilePost: (
    ...args: unknown[]
  ) => api.reconcile(...args),
  getGraphBuildFailedChunksApiKnowledgeDatabasesKbIdGraphBuildFailedChunksGet: (
    ...args: unknown[]
  ) => api.failedChunks(...args),
}));

const { graphApi } = await import('@/features/knowledge-base/api/graph-api');

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('子图查询', () => {
  it('默认只带 kb_id 与后端默认值，不猜参数', async () => {
    api.subgraph.mockResolvedValue({
      data: { success: true, data: { nodes: [], edges: [] } },
      error: undefined,
    });

    await graphApi.getSubgraph('kb-1');

    expect(api.subgraph).toHaveBeenCalledWith({
      query: {
        kb_id: 'kb-1',
        node_label: '*',
        max_depth: 2,
        max_nodes: 100,
        exclude_chunk: false,
      },
    });
  });

  it('关键词、深度、节点上限与排除 Chunk 都按调用方给的传', async () => {
    api.subgraph.mockResolvedValue({
      data: { success: true, data: { nodes: [{ id: 'n-1' }], edges: [] } },
      error: undefined,
    });

    const result = await graphApi.getSubgraph('kb-1', {
      nodeLabel: '张三',
      maxDepth: 3,
      maxNodes: 50,
      excludeChunk: true,
    });

    expect(api.subgraph).toHaveBeenCalledWith({
      query: {
        kb_id: 'kb-1',
        node_label: '张三',
        max_depth: 3,
        max_nodes: 50,
        exclude_chunk: true,
      },
    });
    expect(result.nodes).toHaveLength(1);
  });

  it('后端返回缺字段时退化成空图而不是抛错', async () => {
    api.subgraph.mockResolvedValue({
      data: { success: true },
      error: undefined,
    });

    await expect(graphApi.getSubgraph('kb-1')).resolves.toEqual({
      nodes: [],
      edges: [],
    });
  });

  it('接口失败时抛出后端原因', async () => {
    api.subgraph.mockResolvedValue({
      data: undefined,
      error: { detail: '图谱查询失败' },
      response: { status: 500 },
    });

    await expect(graphApi.getSubgraph('kb-1')).rejects.toThrow('图谱查询失败');
  });
});

describe('图谱构建状态', () => {
  it('按 kb_id 取状态，原样返回后端结构', async () => {
    api.status.mockResolvedValue({
      data: { kb_id: 'kb-1', locked: true, pending_chunks: 7 },
      error: undefined,
    });

    await expect(graphApi.getGraphBuildStatus('kb-1')).resolves.toMatchObject({
      locked: true,
      pending_chunks: 7,
    });
    expect(api.status).toHaveBeenCalledWith({ path: { kb_id: 'kb-1' } });
  });

  it('失败时抛后端原因，不返回空状态', async () => {
    api.status.mockResolvedValue({
      data: undefined,
      error: { detail: '知识库不存在' },
      response: { status: 404 },
    });

    await expect(graphApi.getGraphBuildStatus('kb-1')).rejects.toThrow(
      '知识库不存在',
    );
  });
});

describe('图谱构建写操作', () => {
  it('配置抽取器：提交 extractor_type 与 extractor_options，返回锁定后的配置', async () => {
    api.configure.mockResolvedValue({
      data: { message: 'ok', status: 'success', config: { locked: true } },
      error: undefined,
    });

    await expect(
      graphApi.configureGraphBuild('kb-1', {
        extractorType: 'llm',
        extractorOptions: { model_spec: 'gpt-4o', concurrency_count: 4 },
      }),
    ).resolves.toEqual({ locked: true });
    expect(api.configure).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: {
        extractor_type: 'llm',
        extractor_options: { model_spec: 'gpt-4o', concurrency_count: 4 },
      },
    });
  });

  it('配置响应没有 config 时返回 null，不伪造锁定态', async () => {
    api.configure.mockResolvedValue({
      data: { message: 'ok', status: 'success' },
      error: undefined,
    });

    await expect(
      graphApi.configureGraphBuild('kb-1', {
        extractorType: 'llm',
        extractorOptions: {},
      }),
    ).resolves.toBeNull();
  });

  it('提交构建任务不带 body，queued 算受理', async () => {
    api.index.mockResolvedValue({
      data: { message: '图谱构建任务已提交', status: 'queued', task_id: 't-1' },
      error: undefined,
    });

    await expect(graphApi.indexGraphBuild('kb-1')).resolves.toMatchObject({
      task_id: 't-1',
    });
    expect(api.index).toHaveBeenCalledWith({ path: { kb_id: 'kb-1' } });
  });

  it('提交构建任务返回 200 + failed 时按失败抛出后端原因', async () => {
    api.index.mockResolvedValue({
      data: { message: '请先确认并锁定图谱抽取配置', status: 'failed' },
      error: undefined,
    });

    await expect(graphApi.indexGraphBuild('kb-1')).rejects.toThrow(
      '请先确认并锁定图谱抽取配置',
    );
  });

  it('重置：两个开关都按调用方给的显式提交', async () => {
    api.reset.mockResolvedValue({
      data: { message: '图谱构建状态已重置', reset_chunks: 3 },
      error: undefined,
    });

    await expect(
      graphApi.resetGraphBuild('kb-1', {
        clearExtractionResult: true,
        clearConfig: false,
      }),
    ).resolves.toMatchObject({ reset_chunks: 3 });
    expect(api.reset).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { clear_extraction_result: true, clear_config: false },
    });
  });

  it('向量对账也是后台任务：只传模式，queued 才算受理', async () => {
    api.reconcile.mockResolvedValue({
      data: {
        message: '图谱向量索引修复任务已提交',
        status: 'queued',
        task_id: 't-2',
        mode: 'failed',
      },
      error: undefined,
    });

    await expect(
      graphApi.reconcileGraphBuild('kb-1', 'failed'),
    ).resolves.toMatchObject({ task_id: 't-2', mode: 'failed' });
    expect(api.reconcile).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { mode: 'failed' },
    });
  });

  it('向量对账没被受理时按失败抛出原因', async () => {
    api.reconcile.mockResolvedValue({
      data: { message: '该知识库已有正在运行的图谱构建任务', status: 'failed' },
      error: undefined,
    });

    await expect(
      graphApi.reconcileGraphBuild('kb-1', 'failed'),
    ).rejects.toThrow('该知识库已有正在运行的图谱构建任务');
  });

  it('失败样例：带 limit，缺 samples 时退化成空数组', async () => {
    api.failedChunks.mockResolvedValue({ data: {}, error: undefined });

    await expect(graphApi.getGraphBuildFailedChunks('kb-1')).resolves.toEqual(
      [],
    );
    expect(api.failedChunks).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      query: { limit: 10 },
    });
  });
});
