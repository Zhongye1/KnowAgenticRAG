import { describe, expect, it } from 'vitest';

import {
  formatAttachmentSize,
  getDisplayFileName,
  getFileExtensionLabel,
  getMimeSubtypeLabel,
  normalizeAttachmentPreview,
  normalizeAttachmentPreviews,
} from '@/features/chat/lib/message-attachments';

describe('getDisplayFileName', () => {
  it('取路径最后一段', () => {
    expect(getDisplayFileName('uploads/a/报表.pdf')).toBe('报表.pdf');
  });

  it('空值落到兜底名', () => {
    expect(getDisplayFileName('')).toBe('附件');
    expect(getDisplayFileName(null)).toBe('附件');
    expect(getDisplayFileName(undefined)).toBe('附件');
  });
});

describe('getFileExtensionLabel', () => {
  it('扩展名转大写，大小写不敏感', () => {
    expect(getFileExtensionLabel('报表.PDF')).toBe('PDF');
    expect(getFileExtensionLabel('a/b/c.md')).toBe('MD');
  });

  it('没有扩展名或只有点开头时为空串', () => {
    expect(getFileExtensionLabel('Dockerfile')).toBe('');
    expect(getFileExtensionLabel('.gitignore')).toBe('');
  });
});

describe('getMimeSubtypeLabel', () => {
  it('取 MIME 子类型并转大写', () => {
    expect(getMimeSubtypeLabel('application/pdf')).toBe('PDF');
    expect(getMimeSubtypeLabel('text/plain')).toBe('PLAIN');
  });

  it('空值返回空串', () => {
    expect(getMimeSubtypeLabel(null)).toBe('');
    expect(getMimeSubtypeLabel('')).toBe('');
  });
});

describe('formatAttachmentSize', () => {
  it('按 1024 进制换算并去掉尾零', () => {
    expect(formatAttachmentSize(0)).toBe('0 B');
    expect(formatAttachmentSize(1023)).toBe('1023 B');
    expect(formatAttachmentSize(2048)).toBe('2 KB');
    expect(formatAttachmentSize(1024 * 1024 * 3)).toBe('3 MB');
    expect(formatAttachmentSize(1024 * 1024 * 1.5)).toBe('1.5 MB');
  });

  it('未知与非法值显示 -', () => {
    expect(formatAttachmentSize(null)).toBe('-');
    expect(formatAttachmentSize(undefined)).toBe('-');
    expect(formatAttachmentSize(Number.NaN)).toBe('-');
  });
});

describe('normalizeAttachmentPreview', () => {
  it('按后端字段投影，标识优先 file_id', () => {
    const preview = normalizeAttachmentPreview({
      file_id: 'f-1',
      file_name: '报表.pdf',
      file_type: 'application/pdf',
      file_size: 2048,
      path: '/uploads/f-1_报表.pdf',
      original_artifact_url: '/api/chat/thread/t-1/artifacts/x',
    });

    expect(preview).toEqual({
      fileId: 'f-1',
      name: '报表.pdf',
      previewUrl: '/api/chat/thread/t-1/artifacts/x',
      meta: 'PDF · 2 KB',
    });
  });

  it('没有 file_id 时退到路径，再退到文件名', () => {
    expect(
      normalizeAttachmentPreview({ path: '/uploads/a/b.md' })?.fileId,
    ).toBe('/uploads/a/b.md');
    expect(normalizeAttachmentPreview({ file_name: 'c.txt' })?.fileId).toBe(
      'c.txt',
    );
  });

  it('大小未知时 meta 只留类型，不出现悬空的「-」', () => {
    expect(
      normalizeAttachmentPreview({ file_id: 'f-2', file_name: 'a.pdf' })?.meta,
    ).toBe('PDF');
  });

  it('扩展名与 MIME 都没有时类型显示「文件」', () => {
    expect(
      normalizeAttachmentPreview({
        file_id: 'f-3',
        file_name: 'README',
        file_size: 10,
      })?.meta,
    ).toBe('文件 · 10 B');
  });

  it('没有可用标识时返回 null', () => {
    expect(normalizeAttachmentPreview(null)).toBeNull();
    expect(normalizeAttachmentPreview({})).toBeNull();
  });
});

describe('normalizeAttachmentPreviews', () => {
  it('非数组按没有附件处理', () => {
    expect(normalizeAttachmentPreviews(undefined)).toEqual([]);
    expect(normalizeAttachmentPreviews('x')).toEqual([]);
    expect(normalizeAttachmentPreviews({})).toEqual([]);
  });

  it('丢掉没有标识的条目，保留有标识的', () => {
    const previews = normalizeAttachmentPreviews([
      { file_id: 'f-1', file_name: 'a.pdf', file_size: 1024 },
      {},
      null,
      { file_name: 'b.md' },
    ]);

    expect(previews.map((item) => item.fileId)).toEqual(['f-1', 'b.md']);
  });
});
