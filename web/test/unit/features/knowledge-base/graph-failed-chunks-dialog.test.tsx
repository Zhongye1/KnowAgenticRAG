/**
 * 失败 Chunk 样例弹窗：加载态、加载失败、空态与样例字段。
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { failedChunks: vi.fn() },
}));

vi.mock('@/features/knowledge-base/api/graph-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/graph-api')
  >('@/features/knowledge-base/api/graph-api');
  return {
    ...actual,
    graphApi: {
      ...actual.graphApi,
      getGraphBuildFailedChunks: (...args: unknown[]) =>
        api.failedChunks(...args),
    },
  };
});

const { GraphFailedChunksDialog } =
  await import('@/features/knowledge-base/ui/graph/graph-failed-chunks-dialog');

const renderDialog = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <GraphFailedChunksDialog kbId="kb-1" onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  api.failedChunks.mockReset();
});

describe('失败 Chunk 样例弹窗', () => {
  it('按 chunk 展示序号、文件、尝试次数、原因与原文', async () => {
    api.failedChunks.mockResolvedValue([
      {
        chunk_id: 'c-1',
        file_id: 'f-1',
        chunk_index: 2,
        content: '这是一段原文',
        details: { attempt_count: 3, last_error: '模型返回不是 JSON' },
      },
    ]);
    renderDialog();

    expect(await screen.findByText('Chunk 3')).toBeTruthy();
    expect(screen.getByText('f-1')).toBeTruthy();
    expect(screen.getByText('尝试 3 次')).toBeTruthy();
    expect(screen.getByText('模型返回不是 JSON')).toBeTruthy();
    expect(screen.getByText('这是一段原文')).toBeTruthy();
    expect(api.failedChunks).toHaveBeenCalledWith('kb-1', 10);
  });

  it('没有记录失败原因时给一句占位，不显示空白', async () => {
    api.failedChunks.mockResolvedValue([
      {
        chunk_id: 'c-1',
        file_id: 'f-1',
        chunk_index: 0,
        content: 'x',
        details: null,
      },
    ]);
    renderDialog();

    expect(await screen.findByText('未记录失败原因')).toBeTruthy();
    expect(screen.getByText('尝试 - 次')).toBeTruthy();
  });

  it('没有失败样例时给出空态', async () => {
    api.failedChunks.mockResolvedValue([]);
    renderDialog();

    expect(await screen.findByText('暂无抽取失败的 Chunk')).toBeTruthy();
  });

  it('加载失败时给出可辨认的失败提示，不伪装成空态', async () => {
    api.failedChunks.mockRejectedValue(new Error('boom'));
    renderDialog();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '失败 Chunk 样例加载失败，稍后重试。',
    );
    expect(screen.queryByText('暂无抽取失败的 Chunk')).toBeNull();
  });
});
