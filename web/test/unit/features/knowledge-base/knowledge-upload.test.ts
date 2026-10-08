import { describe, expect, it, vi } from 'vitest';

import {
  buildAddDocumentsParams,
  DEFAULT_SUPPORTED_TYPES,
  getFileExtension,
  getUploadFilename,
  hasOcrImages,
  MAX_UPLOAD_BYTES,
  needsOcr,
  runUploadPool,
  UPLOAD_TOO_LARGE_MESSAGE,
  validateUploadBatch,
} from '@/features/knowledge-base';

// File 的 name/size 是只读 getter，这里用结构相同的替身（被测代码只读这三个字段）
const file = (name: string, size = 1024, extra: Record<string, unknown> = {}) =>
  ({ name, size, ...extra }) as unknown as File;

describe('上传文件校验', () => {
  it('取小写扩展名，没有扩展名给空串', () => {
    expect(getFileExtension('报表.PDF')).toBe('.pdf');
    expect(getFileExtension('brief/a.md')).toBe('.md');
    expect(getFileExtension('Dockerfile')).toBe('');
    expect(getFileExtension('.gitignore')).toBe('');
  });

  it('图片类型要 OCR，集合以后端为准（含 webp）', () => {
    expect(needsOcr('a.png')).toBe(true);
    expect(needsOcr('a.WEBP')).toBe(true);
    expect(needsOcr('a.pdf')).toBe(false);
    expect(hasOcrImages([file('a.md'), file('b.jpg')])).toBe(true);
    expect(hasOcrImages([file('a.md')])).toBe(false);
  });

  it('文件夹上传带相对路径，普通上传用文件名', () => {
    expect(getUploadFilename(file('a.md'))).toBe('a.md');
    expect(
      getUploadFilename(
        file('a.md', 10, { webkitRelativePath: 'docs/2026/a.md' }),
      ),
    ).toBe('docs/2026/a.md');
  });

  it('按白名单与大小分批，超限用后端文案', () => {
    const { accepted, rejected } = validateUploadBatch(
      [
        file('ok.md'),
        file('bad.exe'),
        file('big.pdf', MAX_UPLOAD_BYTES + 1),
      ],
      DEFAULT_SUPPORTED_TYPES,
    );

    expect(accepted.map((item) => item.name)).toEqual(['ok.md']);
    expect(rejected).toEqual([
      { name: 'bad.exe', reason: '不支持的文件类型：.exe' },
      { name: 'big.pdf', reason: UPLOAD_TOO_LARGE_MESSAGE },
    ]);
  });

  it('只接受白名单里的类型，大小刚好等于上限也算通过', () => {
    const boundary = file('edge.png', MAX_UPLOAD_BYTES);

    const { accepted, rejected } = validateUploadBatch([boundary], ['.png']);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });
});

describe('落库参数', () => {
  it('content_hashes 与 file_sizes 以 MinIO 路径为键', () => {
    const params = buildAddDocumentsParams(
      [
        {
          index: 0,
          name: 'a.md',
          file_path: 'http://minio/upload/a.md',
          content_hash: 'hash-a',
          size: 10,
        },
        { index: 1, name: 'b.md', file_path: 'http://minio/upload/b.md' },
      ],
      { parent_id: 'folder-1' },
    );

    expect(params).toEqual({
      content_type: 'file',
      parent_id: 'folder-1',
      content_hashes: { 'http://minio/upload/a.md': 'hash-a' },
      file_sizes: { 'http://minio/upload/a.md': 10 },
    });
  });
});

describe('上传队列', () => {
  it('按并发上限跑完并把结果对回原序', async () => {
    const files = [file('a.md'), file('b.md'), file('c.md')];
    let active = 0;
    let peak = 0;
    const upload = vi.fn(async (item: File) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        file_path: `minio/${item.name}`,
        content_hash: `h-${item.name}`,
      };
    });

    const results = await runUploadPool(files, upload, { concurrency: 2 });

    expect(peak).toBeLessThanOrEqual(2);
    expect(results.map((item) => item.file.name)).toEqual([
      'a.md',
      'b.md',
      'c.md',
    ]);
    expect(results.every((item) => item.status === 'done')).toBe(true);
  });

  it('单个失败不影响其余，失败保留原因', async () => {
    const files = [file('a.md'), file('b.md')];
    const upload = async (item: File) => {
      if (item.name === 'b.md')
        throw new Error('文件过大，当前仅支持 100 MB 以内的文件');
      return { file_path: 'minio/a.md' };
    };

    const results = await runUploadPool(files, upload);

    expect(results[0]).toMatchObject({ status: 'done' });
    expect(results[1]).toMatchObject({
      status: 'error',
      error: UPLOAD_TOO_LARGE_MESSAGE,
    });
  });

  it('状态变化按入队顺序推送', async () => {
    const statuses: string[] = [];
    await runUploadPool(
      [file('a.md')],
      async () => ({ file_path: 'minio/a.md' }),
      { onStatus: (index, status) => statuses.push(`${index}:${status}`) },
    );

    expect(statuses).toEqual(['0:queued', '0:uploading', '0:done']);
  });

  it('空批次直接返回空结果', async () => {
    expect(await runUploadPool([], async () => ({}))).toEqual([]);
  });
});
