import { describe, expect, it } from 'vitest';

import {
  MAX_IMAGE_UPLOAD_BYTES,
  findClipboardImage,
  inferImageMimeType,
  normalizeUploadedImage,
  toImageDataUrl,
  validateImageFile,
} from '@/features/chat/lib/image-upload';

/** 造一个只带校验所需字段的文件，避免在 jsdom 里真的读字节。 */
const createFile = (name: string, type: string, size: number): File => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('图片上传前的校验', () => {
  it('图片且不超过 10MB 时放行', () => {
    expect(
      validateImageFile(createFile('a.png', 'image/png', MAX_IMAGE_UPLOAD_BYTES)),
    ).toBeNull();
  });

  it('非图片类型直接拒绝', () => {
    expect(validateImageFile(createFile('a.pdf', 'application/pdf', 10))).toBe(
      '只能上传图片文件',
    );
  });

  it('没有 MIME 的文件同样拒绝', () => {
    expect(validateImageFile(createFile('a', '', 10))).toBe('只能上传图片文件');
  });

  it('超过 10MB 时给出可行动的文案', () => {
    expect(
      validateImageFile(
        createFile('a.png', 'image/png', MAX_IMAGE_UPLOAD_BYTES + 1),
      ),
    ).toBe('图片文件过大，请上传小于 10MB 的图片');
  });
});

describe('图片 MIME 反推与 data URL', () => {
  it.each([
    ['iVBORw0KGgoAAA', 'image/png'],
    ['/9j/4AAQSkZJRg', 'image/jpeg'],
    ['R0lGODdhAQAB', 'image/gif'],
    ['R0lGODlhAQAB', 'image/gif'],
    ['UklGRhIAAABXRUJQ', 'image/webp'],
    ['Qk1mAAAAAAAA', 'image/bmp'],
  ])('%s 反推为 %s', (base64, expected) => {
    expect(inferImageMimeType(base64)).toBe(expected);
  });

  it('认不出魔数时兜底 jpeg', () => {
    expect(inferImageMimeType('AAAA')).toBe('image/jpeg');
  });

  it('拼 data URL 时优先用已知 MIME，缺失才反推', () => {
    expect(toImageDataUrl('/9j/4AAQ', 'image/webp')).toBe(
      'data:image/webp;base64,/9j/4AAQ',
    );
    expect(toImageDataUrl('iVBORw0KGgoAAA')).toBe(
      'data:image/png;base64,iVBORw0KGgoAAA',
    );
  });
});

describe('粘贴板取图', () => {
  const imageFile = createFile('pasted.png', 'image/png', 100);
  const textFile = createFile('note.txt', 'text/plain', 10);

  const createClipboard = (
    items: Array<{ kind: string; type: string; file: File | null }>,
    files: File[] = [],
  ) =>
    ({
      items: items.map((item) => ({
        kind: item.kind,
        type: item.type,
        getAsFile: () => item.file,
      })),
      files,
    }) as unknown as DataTransfer;

  it('取 items 里的第一张图片', () => {
    const clipboard = createClipboard([
      { kind: 'string', type: 'text/plain', file: null },
      { kind: 'file', type: 'image/png', file: imageFile },
      { kind: 'file', type: 'image/jpeg', file: textFile },
    ]);

    expect(findClipboardImage(clipboard)).toBe(imageFile);
  });

  it('items 里没有图片时在 files 里找图片', () => {
    const clipboard = createClipboard(
      [{ kind: 'string', type: 'text/plain', file: null }],
      [textFile, imageFile],
    );

    expect(findClipboardImage(clipboard)).toBe(imageFile);
  });

  it('files 里只有非图片时返回 null，不把 PDF 当图片拦下', () => {
    const clipboard = createClipboard([], [createFile('a.pdf', 'application/pdf', 10)]);

    expect(findClipboardImage(clipboard)).toBeNull();
  });

  it('只有文本时返回 null，交给输入框的默认粘贴行为', () => {
    expect(findClipboardImage(createClipboard([], []))).toBeNull();
    expect(findClipboardImage(null)).toBeNull();
  });
});

describe('上传响应归一', () => {
  it('成功时带上服务端的 MIME 与原始文件名', () => {
    expect(
      normalizeUploadedImage(
        { success: true, image_content: '/9j/4AAQ', mime_type: 'image/jpeg' },
        'photo.jpg',
      ),
    ).toEqual({
      imageContent: '/9j/4AAQ',
      mimeType: 'image/jpeg',
      originalName: 'photo.jpg',
    });
  });

  it('服务端没给 MIME 时按内容反推', () => {
    const image = normalizeUploadedImage(
      { success: true, image_content: 'iVBORw0KGgoAAA' },
      'a.png',
    );

    expect(image.mimeType).toBe('image/png');
  });

  it('失败响应抛后端给的文案', () => {
    expect(() =>
      normalizeUploadedImage(
        { success: false, error: '图片处理失败: 格式不支持' },
        'a.png',
      ),
    ).toThrow('图片处理失败：图片处理失败: 格式不支持');
  });

  it('成功但没有图片内容时也要抛错，不能把空图发出去', () => {
    expect(() =>
      normalizeUploadedImage({ success: true, image_content: null }, 'a.png'),
    ).toThrow('图片上传失败，请重试。');
  });
});
