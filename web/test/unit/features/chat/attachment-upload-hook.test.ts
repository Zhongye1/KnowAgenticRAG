import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    uploadTmpAttachment: vi.fn(),
    parseTmpAttachment: vi.fn(),
    confirmTmpThreadAttachments: vi.fn(),
  },
}));

vi.mock('@/features/chat/api/attachments-api', () => api);

const { useAttachmentUpload } =
  await import('@/features/chat/model/attachment-upload');
const { MAX_ATTACHMENT_SIZE_BYTES } =
  await import('@/features/chat/lib/attachment-upload');

const file = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' });

const uploaded = (name: string) => ({
  fileName: name,
  fileType: 'application/pdf',
  fileSize: 10,
  objectName: `tmp/${name}`,
  parseSupported: true,
  parseMethods: ['disable', 'rapid_ocr'],
  selectedParseMethod: 'rapid_ocr',
});

describe('useAttachmentUpload', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.uploadTmpAttachment.mockImplementation(async (target: File) =>
      uploaded(target.name),
    );
  });

  it('上传成功后条目变成「已上传」，并带上解析方式默认值', async () => {
    const { result } = renderHook(() => useAttachmentUpload());

    await act(async () => {
      await result.current.addFiles([file('a.pdf')]);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      fileName: 'a.pdf',
      status: 'uploaded',
      objectName: 'tmp/a.pdf',
      selectedParseMethod: 'rapid_ocr',
      error: null,
    });
    expect(result.current.canConfirm).toBe(true);
  });

  it('超过上限的文件直接落到错误态，不发上传请求', async () => {
    const { result } = renderHook(() => useAttachmentUpload());

    await act(async () => {
      await result.current.addFiles([file('big.pdf', MAX_ATTACHMENT_SIZE_BYTES + 1)]);
    });

    expect(api.uploadTmpAttachment).not.toHaveBeenCalled();
    expect(result.current.items[0]?.status).toBe('error');
    expect(result.current.items[0]?.error).toContain('5 MB');
    expect(result.current.canConfirm).toBe(false);
  });

  it('多选时条目立刻全部出现，再各自完成', async () => {
    const pending: Array<(value: ReturnType<typeof uploaded>) => void> = [];
    api.uploadTmpAttachment.mockImplementation(
      () => new Promise((resolve) => pending.push(resolve)),
    );
    const { result } = renderHook(() => useAttachmentUpload());

    let adding!: Promise<void>;
    act(() => {
      adding = result.current.addFiles([file('a.pdf'), file('b.pdf'), file('c.pdf')]);
    });

    // 三条都在「上传中」，不等任何一条回来
    expect(result.current.items).toHaveLength(3);
    expect(result.current.items.every((entry) => entry.status === 'uploading')).toBe(true);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      pending.forEach((resolve, index) => resolve(uploaded(`f${index}.pdf`)));
      await adding;
    });
    expect(result.current.items.every((entry) => entry.status === 'uploaded')).toBe(true);
  });

  it('一条失败不影响另一条', async () => {
    api.uploadTmpAttachment.mockImplementation(async (target: File) => {
      if (target.name === 'bad.pdf') throw new Error('上传失败');
      return uploaded(target.name);
    });
    const { result } = renderHook(() => useAttachmentUpload());

    await act(async () => {
      await result.current.addFiles([file('bad.pdf'), file('good.pdf')]);
    });

    expect(result.current.items.map((item) => item.status)).toEqual(['error', 'uploaded']);
    expect(result.current.items[0]?.error).toBe('上传失败');
    expect(result.current.items[1]?.error).toBeNull();
  });

  it('解析成功后带上解析结果，失败退回「已上传」并留下原因', async () => {
    const { result } = renderHook(() => useAttachmentUpload());
    await act(async () => {
      await result.current.addFiles([file('a.pdf')]);
    });

    api.parseTmpAttachment.mockResolvedValueOnce('tmp/a.parsed.md');
    await act(async () => {
      await result.current.parse(result.current.items[0]!);
    });
    expect(result.current.items[0]).toMatchObject({
      status: 'parsed',
      parsedObjectName: 'tmp/a.parsed.md',
    });

    api.parseTmpAttachment.mockRejectedValueOnce(new Error('解析失败'));
    await act(async () => {
      await result.current.parse(result.current.items[0]!);
    });
    expect(result.current.items[0]).toMatchObject({
      status: 'uploaded',
      parsedObjectName: null,
      parseError: '解析失败',
    });
  });

  it('换解析方式会丢掉上一次的解析结果并退回「已上传」', async () => {
    const { result } = renderHook(() => useAttachmentUpload());
    await act(async () => {
      await result.current.addFiles([file('a.pdf')]);
    });
    api.parseTmpAttachment.mockResolvedValueOnce('tmp/a.parsed.md');
    await act(async () => {
      await result.current.parse(result.current.items[0]!);
    });

    act(() => result.current.setParseMethod(result.current.items[0]!.localId, 'disable'));

    expect(result.current.items[0]).toMatchObject({
      status: 'uploaded',
      selectedParseMethod: 'disable',
      parsedObjectName: null,
    });
  });

  it('移除与清空', async () => {
    const { result } = renderHook(() => useAttachmentUpload());
    await act(async () => {
      await result.current.addFiles([file('a.pdf'), file('b.pdf')]);
    });

    act(() => result.current.remove(result.current.items[0]!.localId));
    expect(result.current.items.map((item) => item.fileName)).toEqual(['b.pdf']);

    act(() => result.current.reset());
    expect(result.current.items).toEqual([]);
  });

  it('清空后在途上传的结果不会再回到列表里', async () => {
    let resolveUpload!: (value: ReturnType<typeof uploaded>) => void;
    api.uploadTmpAttachment.mockImplementation(
      () => new Promise((resolve) => { resolveUpload = resolve; }),
    );
    const { result } = renderHook(() => useAttachmentUpload());

    let adding!: Promise<void>;
    act(() => {
      adding = result.current.addFiles([file('a.pdf')]);
    });
    expect(result.current.items).toHaveLength(1);

    act(() => result.current.reset());
    expect(result.current.items).toEqual([]);

    await act(async () => {
      resolveUpload(uploaded('a.pdf'));
      await adding;
    });

    // 用户已经取消了这一批，迟到的响应不该把它复活
    expect(result.current.items).toEqual([]);
    expect(result.current.canConfirm).toBe(false);
  });

  it('确认只带可确认的条目，并交回后端确认的附件', async () => {
    api.confirmTmpThreadAttachments.mockResolvedValue([
      {
        fileId: 'f-1',
        fileName: 'a.pdf',
        fileType: 'application/pdf',
        fileSize: 10,
        status: 'uploaded',
        requestId: null,
      },
    ]);
    api.uploadTmpAttachment.mockImplementation(async (target: File) =>
      target.name === 'bad.pdf'
        ? Promise.reject(new Error('上传失败'))
        : uploaded(target.name),
    );
    const { result } = renderHook(() => useAttachmentUpload());
    await act(async () => {
      await result.current.addFiles([file('a.pdf'), file('bad.pdf')]);
    });

    let added: unknown[] = [];
    await act(async () => {
      added = await result.current.confirm('thread-A');
    });

    expect(added).toHaveLength(1);
    // 失败的那条不该被发出去
    expect(api.confirmTmpThreadAttachments).toHaveBeenCalledWith({
      threadId: 'thread-A',
      attachments: [
        {
          file_type: 'application/pdf',
          object_name: 'tmp/a.pdf',
          parsed_object_name: null,
        },
      ],
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
  });
});
