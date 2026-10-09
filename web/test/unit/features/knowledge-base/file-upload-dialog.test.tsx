import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗，全套件并行跑时会超过默认 5 秒预算；
 * 与 `knowledge-file-table` 等重交互文件同一口径，给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const { api, notifications } = vi.hoisted(() => ({
  api: {
    uploadFile: vi.fn(),
    addDocuments: vi.fn(),
    supportedTypes: vi.fn(),
    ocrOptions: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
}));

vi.mock('@/features/knowledge-base/api/knowledge-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/knowledge-api')
  >('@/features/knowledge-base/api/knowledge-api');
  return {
    ...actual,
    knowledgeApi: {
      ...actual.knowledgeApi,
      uploadFile: (...args: unknown[]) => api.uploadFile(...args),
      addDocuments: (...args: unknown[]) => api.addDocuments(...args),
      listSupportedTypes: (...args: unknown[]) => api.supportedTypes(...args),
      listOcrOptions: (...args: unknown[]) => api.ocrOptions(...args),
    },
  };
});

vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');
  return {
    ...actual,
    useNotifications: () => notifications,
  };
});

const { FileUploadDialog } =
  await import('@/features/knowledge-base/ui/file-upload-dialog');

// File 的 name/size 是只读 getter，这里用结构相同的替身
const file = (name: string, size = 1024) =>
  ({
    name,
    size,
    type: '',
    arrayBuffer: async () => new ArrayBuffer(1),
  }) as unknown as File;

const renderDialog = (props: Record<string, unknown> = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const handlers = { onOpenChange: vi.fn() };
  render(
    <QueryClientProvider client={queryClient}>
      <FileUploadDialog
        kbId="kb-1"
        parentId={null}
        parentLabel="根目录"
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
};

const pick = async (files: File[]) => {
  const input = screen.getByLabelText('选择文件');
  await userEvent.upload(input, files);
};

/** 拖进来的文件不受输入框 `accept` 限制，类型拒绝这条路径只能这样走。 */
const drop = (files: File[]) =>
  fireEvent.drop(screen.getByTestId('upload-dropzone'), {
    dataTransfer: { files },
  });

describe('上传弹窗', () => {
  beforeEach(() => {
    api.uploadFile.mockReset();
    api.addDocuments.mockReset();
    api.supportedTypes.mockReset().mockResolvedValue(['.md', '.png']);
    api.ocrOptions.mockReset().mockResolvedValue({
      default_engine: 'rapid_ocr',
      engines: [
        { engine_id: 'rapid_ocr', display_name: 'RapidOCR' },
        { engine_id: 'mineru_ocr', display_name: 'MinerU OCR' },
      ],
    });
    notifications.addNotification.mockReset();
  });

  it('展示目标目录与选中的文件', async () => {
    renderDialog({ parentId: 'folder-1', parentLabel: '目录A' });

    expect(screen.getByText(/目标目录：目录A/)).toBeTruthy();
    await pick([file('a.md')]);

    expect(await screen.findByTestId('upload-row')).toHaveTextContent('a.md');
    expect(screen.getByText(/共 1 个文件/)).toBeTruthy();
  });

  it('不支持的类型与超限文件当场拒绝，不进队列', async () => {
    renderDialog();
    drop([file('bad.exe'), file('big.md', 200 * 1024 * 1024)]);

    expect(screen.getByText(/bad\.exe：不支持的文件类型：\.exe/)).toBeTruthy();
    expect(
      screen.getByText(/big\.md：文件过大，当前仅支持 100 MB 以内的文件/),
    ).toBeTruthy();
    expect(screen.queryByTestId('upload-row')).toBeNull();
  });

  it('上传成功后带 content_hashes 与目标目录登记，并关闭弹窗', async () => {
    api.uploadFile.mockResolvedValue({
      file_path: 'minio/a.md',
      content_hash: 'hash-a',
      filename: 'a.md',
      size: 12,
    });
    api.addDocuments.mockResolvedValue({ status: 'queued', task_id: 't-1' });
    const handlers = renderDialog({
      parentId: 'folder-1',
      parentLabel: '目录A',
    });

    await pick([file('a.md')]);
    await userEvent.click(screen.getByRole('button', { name: '开始上传' }));

    await waitFor(() =>
      expect(api.addDocuments).toHaveBeenCalledWith('kb-1', ['minio/a.md'], {
        content_type: 'file',
        parent_id: 'folder-1',
        content_hashes: { 'minio/a.md': 'hash-a' },
        file_sizes: { 'minio/a.md': 12 },
        // 引擎每类文件都带上（Office 解析需要），Office 之类不适用时后端自己忽略
        ocr_engine: 'rapid_ocr',
      }),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: '已提交 1 个文件处理。',
      }),
    );
    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('自动入库开关把 auto_index 带进参数', async () => {
    api.uploadFile.mockResolvedValue({
      file_path: 'minio/a.md',
      content_hash: 'hash-a',
      filename: 'a.md',
      size: 12,
    });
    api.addDocuments.mockResolvedValue({ status: 'queued' });
    renderDialog();

    await pick([file('a.md')]);
    await userEvent.click(screen.getByLabelText('上传后自动解析并入库'));
    await userEvent.click(screen.getByRole('button', { name: '开始上传' }));

    await waitFor(() =>
      expect(api.addDocuments).toHaveBeenCalledWith(
        'kb-1',
        ['minio/a.md'],
        expect.objectContaining({ auto_index: true }),
      ),
    );
  });

  it('有图片时要求选 OCR 引擎，带上默认引擎提交', async () => {
    api.uploadFile.mockResolvedValue({
      file_path: 'minio/a.png',
      content_hash: 'hash-p',
      filename: 'a.png',
      size: 12,
    });
    api.addDocuments.mockResolvedValue({ status: 'queued' });
    renderDialog();

    await pick([file('a.png')]);
    // 引擎列表来自后端，默认取 default_engine
    expect(await screen.findByLabelText('OCR 引擎')).toHaveTextContent(
      'RapidOCR',
    );
    await userEvent.click(screen.getByRole('button', { name: '开始上传' }));

    await waitFor(() =>
      expect(api.addDocuments).toHaveBeenCalledWith(
        'kb-1',
        ['minio/a.png'],
        expect.objectContaining({ ocr_engine: 'rapid_ocr' }),
      ),
    );
  });

  it('全部上传失败时不登记，并给出每行与汇总的原因', async () => {
    api.uploadFile.mockRejectedValue(
      new Error('数据库中已经存在了相同内容文件'),
    );
    renderDialog();

    await pick([file('a.md')]);
    await userEvent.click(screen.getByRole('button', { name: '开始上传' }));

    // 全失败时把首条原因带出来，而不是只说「失败了」
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '所有文件都上传失败：数据库中已经存在了相同内容文件',
    );
    // 失败行上也能看到原因
    expect(await screen.findByTestId('upload-row')).toHaveTextContent(
      '数据库中已经存在了相同内容文件',
    );
    expect(api.addDocuments).not.toHaveBeenCalled();
  });

  it('登记失败时把后端原因显示在弹窗里，不关闭', async () => {
    api.uploadFile.mockResolvedValue({
      file_path: 'minio/a.md',
      content_hash: 'hash-a',
      filename: 'a.md',
      size: 12,
    });
    api.addDocuments.mockRejectedValue(new Error('提交失败: 队列不可用'));
    const handlers = renderDialog();

    await pick([file('a.md')]);
    await userEvent.click(screen.getByRole('button', { name: '开始上传' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '提交失败: 队列不可用',
    );
    expect(handlers.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('没有选文件时不给提交', async () => {
    renderDialog();

    expect(screen.getByRole('button', { name: '开始上传' })).toBeDisabled();
    expect(screen.getByText('还没有选择文件')).toBeTruthy();
  });

  it('清空会丢掉已选文件、拒绝原因与上一轮的失败原因', async () => {
    api.uploadFile.mockRejectedValue(
      new Error('数据库中已经存在了相同内容文件'),
    );
    renderDialog();
    drop([file('bad.exe')]);
    await pick([file('a.md')]);
    await userEvent.click(screen.getByRole('button', { name: '开始上传' }));
    expect(await screen.findByTestId('upload-row')).toHaveTextContent(
      '数据库中已经存在了相同内容文件',
    );

    await userEvent.click(screen.getByRole('button', { name: '清空' }));
    await pick([file('b.md')]);

    // 新选的行不能带着上一轮的后端原因
    expect(screen.getByTestId('upload-row')).not.toHaveTextContent(
      '数据库中已经存在了相同内容文件',
    );
    expect(screen.queryByText(/bad\.exe/)).toBeNull();
  });
});

describe('Office 与无扩展名', () => {
  beforeEach(() => {
    api.uploadFile.mockReset();
    api.addDocuments.mockReset();
    api.supportedTypes.mockReset().mockResolvedValue(['.md', '.xlsx']);
    api.ocrOptions.mockReset().mockResolvedValue({
      default_engine: 'rapid_ocr',
      engines: [{ engine_id: 'rapid_ocr', display_name: 'RapidOCR' }],
    });
    notifications.addNotification.mockReset();
  });

  it('单传一个 xlsx 也要带 ocr_engine：Office 解析需要它', async () => {
    api.uploadFile.mockResolvedValue({
      file_path: 'minio/a.xlsx',
      content_hash: 'hash-x',
      filename: 'a.xlsx',
      size: 12,
    });
    api.addDocuments.mockResolvedValue({ status: 'queued' });
    renderDialog();

    await pick([file('a.xlsx')]);
    await userEvent.click(screen.getByRole('button', { name: '开始上传' }));

    await waitFor(() =>
      expect(api.addDocuments).toHaveBeenCalledWith(
        'kb-1',
        ['minio/a.xlsx'],
        expect.objectContaining({ ocr_engine: 'rapid_ocr' }),
      ),
    );
  });

  it('没有扩展名的文件当场拒绝，不给后端机会报 400', async () => {
    renderDialog();
    drop([file('Dockerfile')]);

    expect(
      await screen.findByText(/Dockerfile：缺少文件扩展名，无法判断类型/),
    ).toBeTruthy();
    expect(screen.queryByTestId('upload-row')).toBeNull();
  });

  it('OCR 选项加载失败时用内置默认引擎，图片仍然传得上去', async () => {
    api.supportedTypes.mockResolvedValue(['.png']);
    api.ocrOptions.mockRejectedValue(new Error('加载 OCR 选项失败'));
    api.uploadFile.mockResolvedValue({
      file_path: 'minio/a.png',
      content_hash: 'hash-p',
      filename: 'a.png',
      size: 12,
    });
    api.addDocuments.mockResolvedValue({ status: 'queued' });
    renderDialog();

    await pick([file('a.png')]);
    await userEvent.click(screen.getByRole('button', { name: '开始上传' }));

    await waitFor(() =>
      expect(api.addDocuments).toHaveBeenCalledWith(
        'kb-1',
        ['minio/a.png'],
        expect.objectContaining({ ocr_engine: 'rapid_ocr' }),
      ),
    );
  });
});
