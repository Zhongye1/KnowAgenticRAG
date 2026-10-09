/**
 * 评估接口层：调用形态、信封解包与端点覆盖。
 *
 * 这批端点都套了一层 `{message:'success', data}`，`unwrap` 只剥生成客户端的 `{data,error,response}`，
 * 因此用例要盯住「拿到的是 data 里面那层」——上一版就是在这里把详情解包错的。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例只做 mock 调用与解包断言，本身很轻；给文件级预算是因为全套件并行跑时
 * 单个用例偶发超过默认 5 秒（与其它重交互文件同一口径，不放宽全局配置）。
 */
vi.setConfig({ testTimeout: 15000 });

const { api, fetchMock } = vi.hoisted(() => ({
  api: {
    listDatasets: vi.fn(),
    getDataset: vi.fn(),
    upload: vi.fn(),
    generate: vi.fn(),
    resume: vi.fn(),
    deleteDataset: vi.fn(),
    listRuns: vi.fn(),
    runEvaluation: vi.fn(),
    getRunResults: vi.fn(),
    deleteRun: vi.fn(),
  },
  fetchMock: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  listEvaluationDatasetsApiEvaluationDatabasesKbIdDatasetsGet: (
    ...args: unknown[]
  ) => api.listDatasets(...args),
  getEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsDatasetIdGet: (
    ...args: unknown[]
  ) => api.getDataset(...args),
  uploadEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsUploadPost: (
    ...args: unknown[]
  ) => api.upload(...args),
  generateEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsGeneratePost: (
    ...args: unknown[]
  ) => api.generate(...args),
  resumeEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsDatasetIdResumePost:
    (...args: unknown[]) => api.resume(...args),
  deleteEvaluationDatasetApiEvaluationDatasetsDatasetIdDelete: (
    ...args: unknown[]
  ) => api.deleteDataset(...args),
  listEvaluationRunsApiEvaluationDatabasesKbIdRunsGet: (...args: unknown[]) =>
    api.listRuns(...args),
  runEvaluationApiEvaluationDatabasesKbIdRunsPost: (...args: unknown[]) =>
    api.runEvaluation(...args),
  getEvaluationRunResultsApiEvaluationDatabasesKbIdRunsRunIdGet: (
    ...args: unknown[]
  ) => api.getRunResults(...args),
  deleteEvaluationRunApiEvaluationDatabasesKbIdRunsRunIdDelete: (
    ...args: unknown[]
  ) => api.deleteRun(...args),
}));

vi.mock('@/shared/api', async () => {
  const actual =
    await vi.importActual<typeof import('@/shared/api')>('@/shared/api');
  return { ...actual, apiFetch: (...args: unknown[]) => fetchMock(...args) };
});

const { evaluationApi } =
  await import('@/features/knowledge-base/api/evaluation-api');

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  fetchMock.mockReset();
});

describe('数据集列表与详情', () => {
  it('列表从信封的 data 取数组', async () => {
    api.listDatasets.mockResolvedValue({
      data: {
        message: 'success',
        data: [{ dataset_id: 'ds-1', name: '基准' }],
      },
      error: undefined,
    });

    await expect(evaluationApi.listDatasets('kb-1')).resolves.toEqual([
      { dataset_id: 'ds-1', name: '基准' },
    ]);
  });

  it('详情拿到的是信封里那层（items/pagination 不能丢）', async () => {
    api.getDataset.mockResolvedValue({
      data: {
        message: 'success',
        data: {
          dataset_id: 'ds-1',
          name: '基准',
          items: [
            { item_id: 'it-1', item_index: 0, query: '问', gold_chunk_ids: [] },
          ],
          pagination: { current_page: 1, page_size: 50, total_pages: 1 },
        },
      },
      error: undefined,
    });

    const detail = await evaluationApi.getDataset('kb-1', 'ds-1');

    expect(detail.items).toHaveLength(1);
    expect(detail.pagination.current_page).toBe(1);
    expect(api.getDataset).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1', dataset_id: 'ds-1' },
      query: { page: 1, page_size: 50 },
    });
  });

  it('详情失败时抛出后端原因', async () => {
    api.getDataset.mockResolvedValue({
      data: undefined,
      error: { detail: 'Dataset is not ready' },
      response: { status: 400 },
    });

    await expect(evaluationApi.getDataset('kb-1', 'ds-1')).rejects.toThrow(
      'Dataset is not ready',
    );
  });
});

describe('数据集写操作', () => {
  it('上传给普通对象，由生成物组 multipart', async () => {
    api.upload.mockResolvedValue({
      data: { message: 'success', data: { dataset_id: 'ds-2' } },
      error: undefined,
    });
    const file = new File(['{}'], 'bench.jsonl', { type: 'application/jsonl' });

    await evaluationApi.uploadDataset('kb-1', {
      file,
      name: '上传的基准',
      description: '说明',
    });

    expect(api.upload).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: { file, name: '上传的基准', description: '说明' },
    });
  });

  it('生成按后端 schema 的字段名提交', async () => {
    api.generate.mockResolvedValue({
      data: { message: 'success', data: { dataset_id: 'ds-3' } },
      error: undefined,
    });

    await evaluationApi.generateDataset('kb-1', {
      name: '自动生成评估数据集',
      description: '',
      count: 10,
      neighbors_count: 1,
      concurrency_count: 10,
      llm_model_spec: 'openai/gpt-4o',
      generation_mode: 'vector',
      graph_expand_top_k: 1,
    });

    expect(api.generate).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: expect.objectContaining({
        llm_model_spec: 'openai/gpt-4o',
        generation_mode: 'vector',
      }),
    });
  });

  it('resume 走独立端点并回传后端消息', async () => {
    api.resume.mockResolvedValue({
      data: { dataset_id: 'ds-1', message: '恢复生成中' },
      error: undefined,
    });

    await expect(
      evaluationApi.resumeDatasetGeneration('kb-1', 'ds-1'),
    ).resolves.toMatchObject({ message: '恢复生成中' });
    expect(api.resume).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1', dataset_id: 'ds-1' },
    });
  });

  it('删除数据集按 dataset_id 路径调用', async () => {
    api.deleteDataset.mockResolvedValue({
      data: { message: 'success', data: null },
      error: undefined,
    });

    await evaluationApi.deleteDataset('ds-1');

    expect(api.deleteDataset).toHaveBeenCalledWith({
      path: { dataset_id: 'ds-1' },
    });
  });

  it('导出走手写 fetch 并解析文件名', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['{"a":1}']),
      headers: new Headers({
        'content-disposition':
          "attachment; filename*=UTF-8''%E5%9F%BA%E5%87%86.jsonl",
      }),
    });

    const result = await evaluationApi.downloadDataset('ds-1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/evaluation/datasets/ds-1/download',
    );
    expect(result.filename).toBe('基准.jsonl');
    expect(result.blob).toBeInstanceOf(Blob);
  });
});

describe('评估运行', () => {
  it('启动评估按 model_config 字段提交（后端 alias）', async () => {
    api.runEvaluation.mockResolvedValue({
      data: { message: 'success', data: { run_id: 'run_12345678' } },
      error: undefined,
    });

    await expect(
      evaluationApi.runEvaluation('kb-1', {
        dataset_id: 'ds-1',
        name: 'eval-1',
        model_config: { answer_llm: 'a', judge_llm: 'b' },
      }),
    ).resolves.toEqual({ run_id: 'run_12345678' });
    expect(api.runEvaluation).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1' },
      body: {
        dataset_id: 'ds-1',
        name: 'eval-1',
        model_config: { answer_llm: 'a', judge_llm: 'b' },
      },
    });
  });

  it('运行历史从信封取数组', async () => {
    api.listRuns.mockResolvedValue({
      data: {
        message: 'success',
        data: [{ run_id: 'run_1', status: 'running' }],
      },
      error: undefined,
    });

    await expect(evaluationApi.listRuns('kb-1')).resolves.toEqual([
      { run_id: 'run_1', status: 'running' },
    ]);
  });

  it('结果详情取信封里那层，默认每页 50 且可只看失败', async () => {
    api.getRunResults.mockResolvedValue({
      data: {
        message: 'success',
        data: {
          run_id: 'run_1',
          status: 'completed',
          items: [],
          pagination: {
            current_page: 2,
            page_size: 50,
            total: 0,
            total_pages: 0,
          },
        },
      },
      error: undefined,
    });

    const results = await evaluationApi.getRunResults('kb-1', 'run_1', {
      page: 2,
      errorOnly: true,
    });

    // 断言产品行为：信封里那层被原样返回，且分页信息不丢
    expect(results.pagination?.current_page).toBe(2);
    expect(results.pagination?.total).toBe(0);
    expect(api.getRunResults).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1', run_id: 'run_1' },
      query: { page: 2, page_size: 50, error_only: true },
    });
  });

  it('运行行还没落库时后端回任务形状，界面要能拿到 progress', async () => {
    api.getRunResults.mockResolvedValue({
      data: {
        message: 'success',
        data: {
          run_id: 'run_1',
          status: 'running',
          progress: 40,
          message: '评估中',
        },
      },
      error: undefined,
    });

    const results = await evaluationApi.getRunResults('kb-1', 'run_1');

    expect(results.items).toBeUndefined();
    expect(results.progress).toBe(40);
  });

  it('删除运行按 kb_id + run_id 调用', async () => {
    api.deleteRun.mockResolvedValue({
      data: { message: 'success', data: null },
      error: undefined,
    });

    await evaluationApi.deleteRun('kb-1', 'run_1');

    expect(api.deleteRun).toHaveBeenCalledWith({
      path: { kb_id: 'kb-1', run_id: 'run_1' },
    });
  });
});
