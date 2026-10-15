import { describe, expect, it, vi } from 'vitest';

import {
  parseDownloadFilename,
  saveBlobAsFile,
} from '@/shared/lib/files/file-download';

describe('parseDownloadFilename', () => {
  it('优先 RFC 5987 的 UTF-8 文件名', () => {
    expect(
      parseDownloadFilename(
        "inline; filename*=UTF-8''%E6%8A%A5%E5%91%8A.md; filename=report.md",
      ),
    ).toBe('报告.md');
  });

  it('ASCII 的 filename 兜底', () => {
    expect(parseDownloadFilename('attachment; filename="report.md"')).toBe(
      'report.md',
    );
    expect(parseDownloadFilename('attachment; filename=report.md')).toBe(
      'report.md',
    );
  });

  it('解析不出或编码损坏时返回空串', () => {
    expect(parseDownloadFilename('')).toBe('');
    expect(parseDownloadFilename(null)).toBe('');
    expect(parseDownloadFilename("inline; filename*=UTF-8'%ZZ.md")).toBe('');
  });
});

describe('saveBlobAsFile', () => {
  it('建临时对象 URL 触发下载并立即回收', () => {
    const createObjectURL = vi.fn(() => 'blob:tmp');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window, 'URL', {
      value: { ...window.URL, createObjectURL, revokeObjectURL },
      configurable: true,
    });
    const click = vi.fn();
    const append = vi.fn();
    const remove = vi.fn();
    const link: Record<string, unknown> = {};
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      remove,
      set href(v: unknown) {
        link.href = v;
      },
      get href() {
        return link.href;
      },
      set download(v: unknown) {
        link.download = v;
      },
      get download() {
        return link.download;
      },
    } as unknown as HTMLElement);
    const appendChild = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation(append);

    const ok = saveBlobAsFile({ blob: new Blob(['x']), filename: '报告.md' });

    expect(ok).toBe(true);
    expect(link.href).toBe('blob:tmp');
    expect(link.download).toBe('报告.md');
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:tmp');
    expect(appendChild).toHaveBeenCalledTimes(1);

    createElement.mockRestore();
    appendChild.mockRestore();
  });
});
