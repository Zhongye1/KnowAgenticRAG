/**
 * 上传 / 生成评估基准两个弹窗：校验在提交前拦下、提交体字段、图增强的可用性判断。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const { api } = vi.hoisted(() => ({
  api: {
    upload: vi.fn(),
    generate: vi.fn(),
    models: vi.fn(),
    graphStatus: vi.fn(),
  },
}));

vi.mock('@/features/knowledge-base/api/evaluation-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/evaluation-api')
  >('@/features/knowledge-base/api/evaluation-api');
  return {
    ...actual,
    evaluationApi: {
      ...actual.evaluationApi,
      uploadDataset: (...args: unknown[]) => api.upload(...args),
      generateDataset: (...args: unknown[]) => api.generate(...args),
    },
  };
});

vi.mock('@/features/knowledge-base/api/graph-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/graph-api')
  >('@/features/knowledge-base/api/graph-api');
  return {
    ...actual,
    graphApi: {
      ...actual.graphApi,
      getGraphBuildStatus: (...args: unknown[]) => api.graphStatus(...args),
    },
  };
});

vi.mock('@/features/knowledge-base/api/knowledge-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/knowledge-api')
  >('@/features/knowledge-base/api/knowledge-api');
  return {
    ...actual,
    knowledgeApi: {
      ...actual.knowledgeApi,
      listModels: (...args: unknown[]) => api.models(...args),
    },
  };
});

const { BenchmarkUploadDialog } =
  await import('@/features/knowledge-base/ui/benchmark-upload-dialog');
const { BenchmarkGenerateDialog } =
  await import('@/features/knowledge-base/ui/benchmark-generate-dialog');

const renderDialog = (
  node: (onOpenChange: (open: boolean) => void) => React.ReactElement,
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      {node(onOpenChange)}
    </QueryClientProvider>,
  );
  return { onOpenChange };
};

const jsonlFile = (name = 'bench.jsonl', body = '{"query":"问"}') =>
  new File([body], name, { type: 'application/jsonl' });

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.models.mockResolvedValue({
    openai: {
      provider_id: 'openai',
      provider_display_name: 'OpenAI',
      models: [
        { spec: 'openai/gpt-4o', model_id: 'gpt-4o', display_name: 'GPT-4o' },
      ],
    },
  });
  api.graphStatus.mockResolvedValue({ indexed_chunks: 0 });
});

describe('上传评估基准弹窗', () => {
  it('没选文件就提交会被拦下', async () => {
    renderDialog((onOpenChange) => (
      <BenchmarkUploadDialog kbId="kb-1" onOpenChange={onOpenChange} />
    ));

    await userEvent.type(screen.getByLabelText(/名称/), '我的基准');
    await userEvent.click(screen.getByRole('button', { name: '上传' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请选择基准文件。',
    );
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('扩展名不对当场说明，且不保留该文件', async () => {
    renderDialog((onOpenChange) => (
      <BenchmarkUploadDialog kbId="kb-1" onOpenChange={onOpenChange} />
    ));

    // userEvent.upload 默认按 input 的 accept 过滤掉不匹配的文件，这里要真的把文件交进去
    await userEvent.upload(
      screen.getByLabelText(/基准文件/),
      new File(['{}'], 'bench.json', { type: 'application/json' }),
      { applyAccept: false },
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '仅支持 JSONL 格式文件。',
    );
  });

  it('内容不是 JSON 对象时拦下并指出行号', async () => {
    renderDialog((onOpenChange) => (
      <BenchmarkUploadDialog kbId="kb-1" onOpenChange={onOpenChange} />
    ));

    await userEvent.upload(
      screen.getByLabelText(/基准文件/),
      jsonlFile('bench.jsonl', '{"query":"a"}\nbroken'),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '第 2 行解析失败',
    );
  });

  it('校验通过后提交名称、说明与文件并关闭', async () => {
    api.upload.mockResolvedValue({ dataset_id: 'ds-1' });
    const { onOpenChange } = renderDialog((change) => (
      <BenchmarkUploadDialog kbId="kb-1" onOpenChange={change} />
    ));

    await userEvent.type(screen.getByLabelText(/名称/), '我的基准');
    await userEvent.type(screen.getByLabelText('说明'), '说明文字');
    await userEvent.upload(screen.getByLabelText(/基准文件/), jsonlFile());
    await userEvent.click(screen.getByRole('button', { name: '上传' }));

    await waitFor(() =>
      expect(api.upload).toHaveBeenCalledWith('kb-1', {
        file: expect.any(File),
        name: '我的基准',
        description: '说明文字',
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('后端拒绝时把原因留在弹窗里', async () => {
    api.upload.mockRejectedValue(new Error('仅支持JSONL格式文件'));
    const { onOpenChange } = renderDialog((change) => (
      <BenchmarkUploadDialog kbId="kb-1" onOpenChange={change} />
    ));

    await userEvent.type(screen.getByLabelText(/名称/), '我的基准');
    await userEvent.upload(screen.getByLabelText(/基准文件/), jsonlFile());
    await userEvent.click(screen.getByRole('button', { name: '上传' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '仅支持JSONL格式文件',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('生成评估基准弹窗', () => {
  it('默认名带日期，未选模型时拦下', async () => {
    renderDialog((onOpenChange) => (
      <BenchmarkGenerateDialog kbId="kb-1" onOpenChange={onOpenChange} />
    ));

    expect((screen.getByLabelText(/名称/) as HTMLInputElement).value).toMatch(
      /^Test-\d{4}-\d{2}-\d{2}-/,
    );
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请选择 LLM 模型。',
    );
    expect(api.generate).not.toHaveBeenCalled();
  });

  it('图谱没构建过时图增强不可选，并说明原因', async () => {
    renderDialog((onOpenChange) => (
      <BenchmarkGenerateDialog kbId="kb-1" onOpenChange={onOpenChange} />
    ));

    expect(await screen.findByText(/当前知识库尚未完成图谱构建/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: /图增强构建/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /向量构建/ })).toBeEnabled();
  });

  it('图谱已构建时图增强可用，切换后出现图谱扩散数', async () => {
    api.graphStatus.mockResolvedValue({ indexed_chunks: 7 });
    renderDialog((onOpenChange) => (
      <BenchmarkGenerateDialog kbId="kb-1" onOpenChange={onOpenChange} />
    ));

    expect(await screen.findByText(/已构建图谱的 chunks：7/)).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: /图增强构建/ }));

    expect(screen.getByLabelText('图谱扩散数')).toBeTruthy();
  });

  it('提交体字段与后端 schema 对齐', async () => {
    api.generate.mockResolvedValue({ dataset_id: 'ds-2' });
    const { onOpenChange } = renderDialog((change) => (
      <BenchmarkGenerateDialog kbId="kb-1" onOpenChange={change} />
    ));

    await userEvent.click(screen.getByRole('combobox', { name: 'LLM 模型' }));
    await userEvent.click(
      await screen.findByRole('option', { name: /GPT-4o/ }),
    );
    await userEvent.clear(screen.getByLabelText('题目数量'));
    await userEvent.type(screen.getByLabelText('题目数量'), '25');
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));

    await waitFor(() =>
      expect(api.generate).toHaveBeenCalledWith(
        'kb-1',
        expect.objectContaining({
          count: 25,
          llm_model_spec: 'openai/gpt-4o',
          generation_mode: 'vector',
          neighbors_count: 1,
          concurrency_count: 10,
          graph_expand_top_k: 1,
        }),
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('题目数量越界时拦下并说明范围', async () => {
    renderDialog((onOpenChange) => (
      <BenchmarkGenerateDialog kbId="kb-1" onOpenChange={onOpenChange} />
    ));

    await userEvent.click(screen.getByRole('combobox', { name: 'LLM 模型' }));
    await userEvent.click(
      await screen.findByRole('option', { name: /GPT-4o/ }),
    );
    await userEvent.clear(screen.getByLabelText('题目数量'));
    await userEvent.type(screen.getByLabelText('题目数量'), '101');
    await userEvent.click(screen.getByRole('button', { name: /生成/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '题目数量需要在',
    );
    expect(api.generate).not.toHaveBeenCalled();
  });
});
