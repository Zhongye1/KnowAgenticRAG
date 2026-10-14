/**
 * 抽取配置弹窗：回填、模型必填、参数 JSON 校验、锁定后不可改抽取器、提交体形状。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

// antd 词汇由应用装配承载，测试同构挂上
import { AntdProvider } from '@/app/theme/antd-provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

import type { GraphBuildStatus } from '@/features/knowledge-base/api/graph-api';

const { api } = vi.hoisted(() => ({
  api: { models: vi.fn() },
}));

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

const { GraphConfigDialog } =
  await import('@/features/knowledge-base/ui/graph-config-dialog');

const CHAT_MODELS = {
  openai: {
    provider_id: 'openai',
    provider_display_name: 'OpenAI',
    models: [
      { spec: 'openai/gpt-4o', model_id: 'gpt-4o', display_name: 'GPT-4o' },
    ],
  },
};

const status = (extra: Partial<GraphBuildStatus> = {}): GraphBuildStatus => ({
  kb_id: 'kb-1',
  kb_type: 'milvus',
  configured: false,
  locked: false,
  config: null,
  total_chunks: 0,
  pending_chunks: 0,
  indexed_chunks: 0,
  structured_chunks: 0,
  extraction_counts: { pending: 0, succeeded: 0, failed: 0 },
  vector_counts: { pending: 0, processing: 0, indexed: 0, failed: 0 },
  entity_count: 0,
  relationship_count: 0,
  build_task_status: null,
  build_task_progress: 0,
  ...extra,
});

const renderDialog = (
  props: Partial<React.ComponentProps<typeof GraphConfigDialog>> = {},
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const handlers = { onOpenChange: vi.fn(), onSubmit: vi.fn() };
  render(
    <AntdProvider>
      <QueryClientProvider client={queryClient}>
        <GraphConfigDialog status={status()} {...handlers} {...props} />
      </QueryClientProvider>
    </AntdProvider>,
  );
  return handlers;
};

beforeEach(() => {
  api.models.mockReset().mockResolvedValue(CHAT_MODELS);
});

describe('图谱抽取配置弹窗', () => {
  it('用 chat 模型列表填下拉，未选模型时拦下并说明', async () => {
    const handlers = renderDialog();
    await waitFor(() => expect(api.models).toHaveBeenCalledWith('chat'));

    await userEvent.click(screen.getByRole('button', { name: '锁定配置' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请选择抽取模型。',
    );
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('选好模型后提交提取器类型与选项（模型与 Schema 去空白）', async () => {
    const handlers = renderDialog();

    await userEvent.click(screen.getByRole('combobox', { name: '抽取模型' }));
    await userEvent.click(
      await screen.findByRole('option', { name: /GPT-4o/ }),
    );
    await userEvent.type(screen.getByLabelText('Schema'), '  实体：Person  ');
    await userEvent.clear(screen.getByLabelText('LLM 抽取并发数'));
    await userEvent.type(screen.getByLabelText('LLM 抽取并发数'), '8');
    // user-event 把 `{` 当描述符，字面量要转义
    await userEvent.type(
      screen.getByLabelText('模型参数 JSON'),
      '{{"temperature":0.1}',
    );
    await userEvent.click(screen.getByRole('button', { name: '锁定配置' }));

    expect(handlers.onSubmit).toHaveBeenCalledWith({
      extractorType: 'llm',
      extractorOptions: {
        model_spec: 'openai/gpt-4o',
        schema: '实体：Person',
        concurrency_count: 8,
        model_params: { temperature: 0.1 },
      },
    });
  });

  it('模型参数不是 JSON 时拦下，不提交', async () => {
    const handlers = renderDialog();

    await userEvent.click(screen.getByRole('combobox', { name: '抽取模型' }));
    await userEvent.click(
      await screen.findByRole('option', { name: /GPT-4o/ }),
    );
    await userEvent.type(screen.getByLabelText('模型参数 JSON'), 'not-json');
    await userEvent.click(screen.getByRole('button', { name: '锁定配置' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '模型参数必须是合法 JSON 对象。',
    );
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });

  it('已锁定时回填配置、给提醒、抽取器不可改且按钮是保存配置', async () => {
    renderDialog({
      status: status({
        locked: true,
        config: {
          locked: true,
          extractor_type: 'llm',
          extractor_options: {
            model_spec: 'openai/gpt-4o',
            schema: '实体：Person',
            concurrency_count: 8,
          },
        },
      }),
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      '修改配置仅影响后续构建',
    );
    expect(screen.getByRole('radio', { name: /LLM/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /更多/ })).toBeDisabled();
    expect(screen.getByLabelText('Schema')).toHaveValue('实体：Person');
    expect(screen.getByLabelText('LLM 抽取并发数')).toHaveValue(8);
    expect(screen.getByRole('button', { name: '保存配置' })).toBeTruthy();
  });

  it('模型列表加载失败时给出原因（而不是空白下拉）', async () => {
    api.models.mockRejectedValue(new Error('boom'));
    renderDialog();

    expect(
      await screen.findByText(
        '模型列表加载失败，先确认模型供应商可用再配置抽取器。',
      ),
    ).toBeTruthy();
  });

  it('取消把关闭动作交给调用方', async () => {
    const handlers = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  });
});
