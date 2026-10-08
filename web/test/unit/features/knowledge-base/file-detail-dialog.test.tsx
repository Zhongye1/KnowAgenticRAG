import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { fileContent: vi.fn() },
}));

vi.mock('@/features/knowledge-base/api/knowledge-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/knowledge-api')
  >('@/features/knowledge-base/api/knowledge-api');
  return {
    ...actual,
    knowledgeApi: {
      ...actual.knowledgeApi,
      getFileContent: (...args: unknown[]) => api.fileContent(...args),
    },
  };
});

vi.mock('@/shared/ui/markdown', () => ({
  // 真渲染器会走 shiki 与 DOMPurify，这里只确认拿到了哪些内容与主题
  Markdown: ({ content, theme }: { content: string; theme?: string }) => (
    <div data-testid="markdown" data-theme={theme}>
      {content}
    </div>
  ),
}));

const { FileDetailDialog } =
  await import('@/features/knowledge-base/ui/file-detail-dialog');

const file = (extra: Record<string, unknown> = {}) => ({
  file_id: 'f-1',
  filename: '报表.md',
  file_type: 'md',
  status: 'indexed',
  file_size: 2048,
  chunk_count: 2,
  token_count: 120,
  created_at: '2026-10-08T02:00:00Z',
  created_by: 'u-1',
  created_by_name: '张三',
  is_folder: false,
  has_children: false,
  children_count: 0,
  has_original_file: true,
  has_parsed_markdown: true,
  is_virtual_folder: false,
  ...extra,
});

const renderDialog = (props: Record<string, unknown> = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const handlers = { onOpenChange: vi.fn() };
  render(
    <QueryClientProvider client={queryClient}>
      <FileDetailDialog kbId="kb-1" file={file()} {...handlers} {...props} />
    </QueryClientProvider>,
  );
  return handlers;
};

describe('文件详情弹窗', () => {
  beforeEach(() => {
    api.fileContent.mockReset().mockResolvedValue({
      content: '# 解析结果',
      lines: [
        { id: 'c-1', content: '第一段内容', chunk_order_index: 0 },
        { id: 'c-2', content: '第二段内容', chunk_order_index: 1 },
      ],
    });
  });

  it('头部给出文件名、类型、状态与体量', async () => {
    renderDialog();
    await screen.findByText('报表.md');

    expect(screen.getByText('md')).toBeTruthy();
    expect(screen.getByText('已入库')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
  });

  it('默认看解析结果，切到分块后按序号列出合并后的分块', async () => {
    // 顺序打乱 + 完全被覆盖的分块：合并后要按序号排、且不重复列出
    api.fileContent.mockResolvedValue({
      content: '# 解析结果',
      lines: [
        { id: 'c-2', content: 'first chunk', chunk_order_index: 1 },
        {
          id: 'c-1',
          content: 'hello world this is the first chunk',
          chunk_order_index: 0,
        },
      ],
    });
    renderDialog();

    expect(await screen.findByTestId('markdown')).toHaveTextContent('解析结果');

    await userEvent.click(screen.getByRole('tab', { name: '分块' }));

    const chunks = await screen.findAllByTestId('file-chunk');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveTextContent('#0');
    expect(chunks[0]).toHaveTextContent('hello world this is the first chunk');
  });

  it('服务端没给 Markdown 时用分块合并兜底', async () => {
    api.fileContent.mockResolvedValue({
      content: null,
      lines: [
        { id: 'c-1', content: '第一段', chunk_order_index: 0 },
        { id: 'c-2', content: '第二段', chunk_order_index: 1 },
      ],
    });
    renderDialog();

    await waitFor(() =>
      expect(screen.getByTestId('markdown')).toHaveTextContent('第一段 第二段'),
    );
  });

  it('内容加载失败给出原因而不是空结果', async () => {
    api.fileContent.mockRejectedValue(new Error('Failed to get file content'));
    renderDialog();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to get file content',
    );
  });

  it('没有传入源文件渲染时不给「源文件」视图', async () => {
    renderDialog();
    await screen.findByText('报表.md');

    expect(screen.queryByRole('tab', { name: '源文件' })).toBeNull();
  });

  it('传入源文件渲染时多出「源文件」视图，并按传入的初始视图打开', async () => {
    renderDialog({
      defaultView: 'source',
      renderSource: () => <div data-testid="source-view">源文件内容</div>,
    });

    expect(await screen.findByTestId('source-view')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '源文件' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('关闭时把动作交给调用方', async () => {
    const handlers = renderDialog();
    await screen.findByText('报表.md');

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('视图可见性与主题', () => {
  beforeEach(() => {
    api.fileContent.mockReset().mockResolvedValue({
      content: '# 解析结果',
      lines: [{ id: 'c-1', content: '第一段内容', chunk_order_index: 0 }],
    });
  });

  it('只有源文件可看的行不给解析结果与分块，也不去拉内容', async () => {
    api.fileContent.mockReset();
    renderDialog({
      file: file({
        status: 'uploaded',
        has_parsed_markdown: false,
        has_original_file: true,
      }),
      renderSource: () => <div data-testid="source-view">源文件</div>,
    });

    expect(await screen.findByTestId('source-view')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: '解析结果' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '分块' })).toBeNull();
    expect(api.fileContent).not.toHaveBeenCalled();
  });

  it('URL 类型没有源文件视图，但能看解析结果', async () => {
    renderDialog({
      file: file({ file_type: 'url', has_original_file: false }),
      renderSource: () => <div data-testid="source-view">源文件</div>,
    });

    await screen.findByText('报表.md');
    expect(screen.queryByRole('tab', { name: '源文件' })).toBeNull();
    expect(screen.getByRole('tab', { name: '解析结果' })).toBeTruthy();
  });

  it('分块加载失败给出原因，而不是「还没有分块」', async () => {
    api.fileContent.mockRejectedValue(new Error('Failed to get file content'));
    renderDialog({
      file: file({ status: 'indexed', has_parsed_markdown: true }),
    });
    await screen.findByText('报表.md');

    await userEvent.click(screen.getByRole('tab', { name: '分块' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to get file content',
    );
  });

  it('暗色主题下按暗色渲染 Markdown', async () => {
    document.documentElement.classList.add('dark');
    renderDialog();
    await screen.findByTestId('markdown');

    expect(screen.getByTestId('markdown')).toHaveAttribute(
      'data-theme',
      'github-dark',
    );
    document.documentElement.classList.remove('dark');
  });
});
