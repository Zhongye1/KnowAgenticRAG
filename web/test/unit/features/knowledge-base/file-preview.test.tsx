import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { previewFile: vi.fn() },
}));

vi.mock('@/features/knowledge-base/api/knowledge-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/knowledge-api')
  >('@/features/knowledge-base/api/knowledge-api');
  return {
    ...actual,
    knowledgeApi: {
      ...actual.knowledgeApi,
      previewFile: (...args: unknown[]) => api.previewFile(...args),
    },
  };
});

vi.mock('@/shared/ui/markdown', () => ({
  Markdown: ({ content }: { content: string }) => (
    <div data-testid="markdown-preview">{content}</div>
  ),
}));

const renderCodeBlock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/markdown', () => ({
  renderCodeBlock: (...args: unknown[]) => renderCodeBlock(...args),
}));

vi.mock('@/features/knowledge-base/ui/files/preview/pdf-preview', () => ({
  PdfPreview: ({ blob }: { blob: Blob }) => (
    <div data-testid="pdf-preview-stub">{blob.size}</div>
  ),
}));

const { FilePreview: FilePreviewPane } =
  await import('@/features/knowledge-base/ui/files/preview/file-preview');

const file = {
  file_id: 'f-1',
  filename: 'brief/报表.md',
  file_type: 'md',
  status: 'indexed',
  file_size: 1024,
  chunk_count: 0,
  token_count: 0,
  is_folder: false,
  has_children: false,
  children_count: 0,
  has_original_file: true,
  has_parsed_markdown: true,
  is_virtual_folder: false,
};

const preview = (extra: Record<string, unknown> = {}) => ({
  previewType: 'text',
  supported: true,
  content: '正文',
  blob: null,
  filename: '报表.md',
  message: '',
  truncated: false,
  ...extra,
});

const renderPreview = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <FilePreviewPane kbId="kb-1" file={file} />
    </QueryClientProvider>,
  );
};

describe('源文件预览分发', () => {
  beforeEach(() => {
    api.previewFile.mockReset();
    renderCodeBlock.mockReset().mockResolvedValue('<pre>高亮结果</pre>');
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('按 kbId 与文件名请求预览', async () => {
    api.previewFile.mockResolvedValue(preview());
    renderPreview();

    await waitFor(() =>
      expect(api.previewFile).toHaveBeenCalledWith(
        'kb-1',
        'f-1',
        'brief/报表.md',
      ),
    );
  });

  it('图片用 objectURL 渲染，卸载时释放', async () => {
    api.previewFile.mockResolvedValue(
      preview({
        previewType: 'image',
        content: null,
        blob: new Blob(['img']),
        filename: '照片.png',
      }),
    );
    const { unmount } = render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FilePreviewPane kbId="kb-1" file={file} />
      </QueryClientProvider>,
    );

    const image = await screen.findByRole('img');
    expect(image).toHaveAttribute('src', 'blob:mock');
    expect(image).toHaveAttribute('alt', '照片.png');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('PDF 交给 PdfPreview', async () => {
    api.previewFile.mockResolvedValue(
      preview({
        previewType: 'pdf',
        content: null,
        blob: new Blob(['pdf-bytes']),
      }),
    );
    renderPreview();

    expect(await screen.findByTestId('pdf-preview-stub')).toHaveTextContent(
      '9',
    );
  });

  it('Markdown 交给共享渲染器', async () => {
    api.previewFile.mockResolvedValue(
      preview({ previewType: 'markdown', content: '# 标题' }),
    );
    renderPreview();

    expect(await screen.findByTestId('markdown-preview')).toHaveTextContent(
      '# 标题',
    );
  });

  it('HTML 放进沙箱 iframe', async () => {
    api.previewFile.mockResolvedValue(
      preview({ previewType: 'html', content: '<p>页面</p>' }),
    );
    renderPreview();

    const frame = await screen.findByTitle('报表.md 预览');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame).toHaveAttribute('srcdoc', '<p>页面</p>');
  });

  it('文本与代码按路径语言高亮，并带上当前主题', async () => {
    api.previewFile.mockResolvedValue(
      preview({ previewType: 'text', content: 'print(1)', filename: 'a.py' }),
    );
    renderPreview();

    await waitFor(() =>
      expect(renderCodeBlock).toHaveBeenCalledWith('print(1)', 'python', {
        theme: 'github-light',
      }),
    );
    expect(await screen.findByText('高亮结果')).toBeTruthy();
  });

  it('高亮不可用时退回纯文本', async () => {
    renderCodeBlock.mockResolvedValue('');
    api.previewFile.mockResolvedValue(
      preview({ previewType: 'text', content: 'print(1)', filename: 'a.py' }),
    );
    renderPreview();

    expect(await screen.findByText('print(1)')).toBeTruthy();
  });

  it('不支持的类型给出后端原因', async () => {
    api.previewFile.mockResolvedValue(
      preview({
        previewType: 'unsupported',
        supported: false,
        content: null,
        message: '当前文件是二进制文件，暂不支持预览',
      }),
    );
    renderPreview();

    expect(
      await screen.findByText('当前文件是二进制文件，暂不支持预览'),
    ).toBeTruthy();
  });

  it('后端标了不支持就按它来，不硬按类型渲染', async () => {
    // 例如文件超过 30 MiB：类型看着是 PDF，但没有字节可渲染
    api.previewFile.mockResolvedValue(
      preview({
        previewType: 'pdf',
        supported: false,
        content: null,
        blob: null,
        message: '文件过大，暂不支持预览',
      }),
    );
    renderPreview();

    expect(await screen.findByText('文件过大，暂不支持预览')).toBeTruthy();
    expect(screen.queryByTestId('pdf-preview-stub')).toBeNull();
  });

  it('加载失败给出原因', async () => {
    api.previewFile.mockRejectedValue(new Error('文件没有可预览的原始内容'));
    renderPreview();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '文件没有可预览的原始内容',
    );
  });
});
