import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    listTypes: vi.fn(),
    listModels: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/features/knowledge-base/api/knowledge-api', () => ({
  knowledgeApi: {
    listTypes: (...args: unknown[]) => api.listTypes(...args),
    listModels: (...args: unknown[]) => api.listModels(...args),
    create: (...args: unknown[]) => api.create(...args),
    update: (...args: unknown[]) => api.update(...args),
    // 表单不触发列表查询，但切片模块被一起加载，保持形状完整
    list: vi.fn().mockResolvedValue([]),
    remove: vi.fn(),
    get: vi.fn(),
  },
}));

const { KnowledgeFormDialog } =
  await import('@/features/knowledge-base/ui/knowledge-form-dialog');

const milvusType = {
  name: 'ARS',
  requires_embedding_model: true,
  supports_documents: true,
  create_params: { options: [] },
};

const difyType = {
  name: 'Dify',
  requires_embedding_model: false,
  supports_documents: false,
  create_params: {
    options: [
      {
        key: 'dify_api_url',
        label: 'Dify API URL',
        type: 'text',
        required: true,
      },
    ],
  },
};

/** Radix Select 在 jsdom 里要点开 portal，整仓并发跑时给它更宽的窗口。 */
const findOption = (name: string | RegExp) =>
  screen.findByRole('option', { name }, { timeout: 5_000 });

const renderDialog = (
  props: Partial<React.ComponentProps<typeof KnowledgeFormDialog>> = {},
) => {
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeFormDialog open onOpenChange={onOpenChange} {...props} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
};

/**
 * 要开下拉、选类型再等请求的用例，并行跑整套时会超过默认的 5 秒：
 * 它们自带预算，不依赖全局 `testTimeout`。
 */
const itSlow = (name: string, fn: () => Promise<void>) => it(name, fn, 15000);

describe('知识库表单对话框', () => {
  beforeEach(() => {
    api.listTypes.mockReset().mockResolvedValue({ milvus: milvusType });
    api.listModels.mockReset().mockResolvedValue({
      p1: {
        provider_id: 'p1',
        provider_display_name: 'OpenAI',
        models: [
          { spec: 'p1:bge-m3', model_id: 'bge-m3', display_name: 'BGE M3' },
        ],
      },
    });
    api.create.mockReset().mockResolvedValue(undefined);
    api.update.mockReset().mockResolvedValue(undefined);
  });

  it('名称为空时不提交，并给出原因', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请输入知识库名称',
    );
    expect(api.create).not.toHaveBeenCalled();
  });

  it('没选类型时拦下，不把空 kb_type 发给后端', async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText('知识库名称'), '库');
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请选择知识库类型',
    );
    expect(api.create).not.toHaveBeenCalled();
  });

  itSlow('创建时提交类型、模型与默认共享范围', async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText('知识库名称'), ' 新库 ');
    await userEvent.type(screen.getByLabelText('知识库描述'), '说明');
    await userEvent.click(screen.getByLabelText('知识库类型'));
    await userEvent.click(await findOption('ARS'));
    await userEvent.click(screen.getByLabelText('嵌入模型'));
    await userEvent.click(await findOption(/BGE M3/));
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        database_name: '新库',
        description: '说明',
        kb_type: 'milvus',
        embedding_model_spec: 'p1:bge-m3',
        share_config: expect.objectContaining({ version: 2 }),
      }),
    );
  });

  it('切换类型会换上该类型的专属参数', async () => {
    api.listTypes.mockResolvedValue({ milvus: milvusType, dify: difyType });
    renderDialog();

    await userEvent.type(screen.getByLabelText('知识库名称'), '库');
    await userEvent.click(screen.getByLabelText('知识库类型'));
    await userEvent.click(await findOption('Dify'));

    expect(await screen.findByLabelText('Dify API URL')).toBeTruthy();
    // 不需要嵌入模型的类型不再要求模型
    expect(screen.queryByLabelText('嵌入模型')).toBeNull();
  });

  itSlow('创建失败时显示后端原因且不关闭', async () => {
    api.create.mockRejectedValue(new Error('知识库名称已存在'));
    const { onOpenChange } = renderDialog();

    await userEvent.type(screen.getByLabelText('知识库名称'), '重名库');
    await userEvent.click(screen.getByLabelText('知识库类型'));
    await userEvent.click(await findOption('ARS'));
    await userEvent.click(screen.getByLabelText('嵌入模型'));
    await userEvent.click(await findOption(/BGE M3/));
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '知识库名称已存在',
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('编辑只提交名称与描述，不回写列表投影里的 additional_params', async () => {
    renderDialog({
      database: {
        kb_id: 'kb-1',
        name: '老库',
        description: '老描述',
        kb_type: 'dify',
        embedding_model_spec: null,
        // 列表返回的真实形状：additional_params 里注入了 stats，且可能被按权限脱敏
        additional_params: {
          stats: { file_count: 3 },
          dify_api_url: 'https://api.dify.ai/v1',
        },
        stats: {} as never,
      },
    });

    expect(screen.getByLabelText<HTMLInputElement>('知识库名称').value).toBe(
      '老库',
    );
    expect(screen.queryByLabelText('知识库类型')).toBeNull();

    await userEvent.clear(screen.getByLabelText('知识库名称'));
    await userEvent.type(screen.getByLabelText('知识库名称'), '新名字');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('kb-1', {
        name: '新名字',
        description: '老描述',
      }),
    );
    expect(api.update.mock.calls[0]?.[1]).not.toHaveProperty(
      'additional_params',
    );
  });

  it('编辑成功后会关闭对话框', async () => {
    const { onOpenChange } = renderDialog({
      database: {
        kb_id: 'kb-1',
        name: '老库',
        description: '',
        kb_type: 'milvus',
        stats: {} as never,
      },
    });

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
