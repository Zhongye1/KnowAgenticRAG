import { describe, expect, it } from 'vitest';

import {
  getPreviewFileExtension,
  getPreviewTypeByContentType,
  getPreviewTypeByPath,
  isMarkdownPreview,
} from '@/shared/lib/file-preview';

describe('getPreviewFileExtension', () => {
  it('取小写扩展名；隐藏文件不算', () => {
    expect(getPreviewFileExtension('/a/B.PDF')).toBe('.pdf');
    expect(getPreviewFileExtension('/a/.gitignore')).toBe('');
    expect(getPreviewFileExtension('/a/noext')).toBe('');
    expect(getPreviewFileExtension('')).toBe('');
  });
});

describe('getPreviewTypeByPath', () => {
  it('按扩展名分组', () => {
    expect(getPreviewTypeByPath('/a/b.md')).toBe('markdown');
    expect(getPreviewTypeByPath('/a/b.png')).toBe('image');
    expect(getPreviewTypeByPath('/a/b.pdf')).toBe('pdf');
    expect(getPreviewTypeByPath('/a/b.docx')).toBe('office');
    expect(getPreviewTypeByPath('/a/b.py')).toBe('text');
    expect(getPreviewTypeByPath('/a/b.weird')).toBe('unsupported');
  });
});

describe('getPreviewTypeByContentType', () => {
  it('按响应头分组', () => {
    expect(getPreviewTypeByContentType('application/pdf')).toBe('pdf');
    expect(getPreviewTypeByContentType('image/png')).toBe('image');
    expect(getPreviewTypeByContentType('text/markdown')).toBe('markdown');
    expect(getPreviewTypeByContentType('application/json')).toBe('json');
    expect(getPreviewTypeByContentType('application/octet-stream')).toBe(
      'unsupported',
    );
  });
});

describe('isMarkdownPreview', () => {
  it('类型声明或扩展名任一命中', () => {
    expect(isMarkdownPreview('/a/b.md', 'text')).toBe(true);
    expect(isMarkdownPreview('/a/b.txt', 'markdown')).toBe(true);
    expect(isMarkdownPreview('/a/b.txt', 'text')).toBe(false);
  });
});
