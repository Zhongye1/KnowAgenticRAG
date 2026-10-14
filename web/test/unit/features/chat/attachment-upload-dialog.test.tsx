import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AttachmentItem } from '@/features/chat/lib/attachment-upload';
import { AttachmentUploadDialog } from '@/features/chat/ui/attachment-upload';

const item = (patch: Partial<AttachmentItem> = {}): AttachmentItem => ({
  localId: 'a',
  fileName: 'a.pdf',
  fileSize: 2048,
  fileType: 'application/pdf',
  objectName: 'tmp/a.pdf',
  parseSupported: true,
  parseMethods: ['disable', 'rapid_ocr'],
  selectedParseMethod: 'rapid_ocr',
  parsedObjectName: null,
  status: 'uploaded',
  error: null,
  parseError: null,
  ...patch,
});

const setup = (overrides: Record<string, unknown> = {}) => {
  const upload = {
    items: [] as AttachmentItem[],
    busy: false,
    canConfirm: false,
    addFiles: vi.fn(async () => undefined),
    parse: vi.fn(async () => undefined),
    setParseMethod: vi.fn(),
    remove: vi.fn(),
    reset: vi.fn(),
    confirm: vi.fn(async () => 1),
    ...overrides,
  };
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    upload: upload as never,
    onConfirm: vi.fn(async () => undefined),
  };

  render(<AttachmentUploadDialog {...props} />);

  return { upload, props };
};

describe('AttachmentUploadDialog', () => {
  it('显示上限提示与选择文件入口', () => {
    setup();

    // 拖拽区承担「选择文件」入口（参照 a-upload-dragger），大小上限在描述行
    expect(screen.getByRole('button', { name: '选择附件文件' })).toBeTruthy();
    expect(screen.getByText(/单个不超过 5 MB/)).toBeTruthy();
  });

  it('选文件后把文件交给上传动作', async () => {
    const { upload } = setup();

    await userEvent.upload(
      screen.getByLabelText('选择附件文件输入'),
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
    );

    expect(upload.addFiles).toHaveBeenCalledTimes(1);
    expect(
      (upload.addFiles as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ).toHaveLength(1);
  });

  it('列出条目并显示大小与状态', () => {
    setup({ items: [item()] });

    expect(screen.getByText('a.pdf')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();
    expect(screen.getByText('已上传')).toBeTruthy();
  });

  it('支持解析的条目能换解析方式并触发解析', async () => {
    const { upload } = setup({ items: [item()] });

    await userEvent.selectOptions(
      screen.getByLabelText('a.pdf 的解析方式'),
      'disable',
    );
    expect(upload.setParseMethod).toHaveBeenCalledWith('a', 'disable');

    await userEvent.click(screen.getByRole('button', { name: '解析' }));
    expect(upload.parse).toHaveBeenCalledWith(
      expect.objectContaining({ localId: 'a' }),
    );
  });

  it('解析中锁住解析方式与解析按钮', () => {
    setup({ items: [item({ status: 'parsing' })] });

    expect(
      (screen.getByLabelText('a.pdf 的解析方式') as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: '解析' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('确认期间锁住选择文件、移除与解析方式', async () => {
    const { props } = setup({ items: [item()], canConfirm: true });
    let resolveConfirm!: () => void;
    (props.onConfirm as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );

    await userEvent.click(screen.getByRole('button', { name: /^添\s*加$/ }));

    // 确认期间不允许再改这一批内容，否则发出去的不是用户看到的
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: '选择附件文件' })
          .getAttribute('aria-disabled'),
      ).toBe('true'),
    );
    expect(
      (screen.getByRole('button', { name: '移除 a.pdf' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText('a.pdf 的解析方式') as HTMLSelectElement).disabled,
    ).toBe(true);

    resolveConfirm();
  });

  it('不支持解析的条目没有解析控件', () => {
    setup({ items: [item({ parseSupported: false, parseMethods: [] })] });

    expect(screen.queryByRole('button', { name: '解析' })).toBeNull();
  });

  it('条目上的错误会显示出来', () => {
    setup({ items: [item({ status: 'error', error: '上传失败' })] });

    expect(screen.getByText('上传失败')).toBeTruthy();
  });

  it('没有可确认条目时「添加」禁用', () => {
    setup({ items: [item({ status: 'uploading' })], canConfirm: false });

    expect(
      (screen.getByRole('button', { name: /^添\s*加$/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('点「添加」调用确认动作', async () => {
    const { props } = setup({ items: [item()], canConfirm: true });

    await userEvent.click(screen.getByRole('button', { name: /^添\s*加$/ }));

    await waitFor(() => expect(props.onConfirm).toHaveBeenCalledTimes(1));
  });

  it('确认失败时显示原因且不关闭', async () => {
    const { props } = setup({ items: [item()], canConfirm: true });
    (props.onConfirm as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('创建对话失败，无法添加附件'),
    );

    await userEvent.click(screen.getByRole('button', { name: /^添\s*加$/ }));

    expect(await screen.findByText('创建对话失败，无法添加附件')).toBeTruthy();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('关闭时清空条目', async () => {
    const { upload } = setup({ items: [item()] });

    await userEvent.click(screen.getByRole('button', { name: /^取\s*消$/ }));

    expect(upload.reset).toHaveBeenCalled();
  });

  it('点移除会把该条目标识交回', async () => {
    const { upload } = setup({ items: [item()] });

    await userEvent.click(screen.getByRole('button', { name: '移除 a.pdf' }));

    expect(upload.remove).toHaveBeenCalledWith('a');
  });
});
