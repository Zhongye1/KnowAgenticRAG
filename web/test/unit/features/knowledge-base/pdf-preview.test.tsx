import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  version: '0.0.0-test',
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'pdf.worker.js',
}));

const { PdfPreview } = await import('@/features/knowledge-base/ui/pdf-preview');

/**
 * jsdom 的 Blob 没有 `arrayBuffer()`（浏览器有），这里给出最小替身。
 */
const blob = (size = 3) =>
  ({ size, arrayBuffer: async () => new ArrayBuffer(size) }) as unknown as Blob;

/** pdfjs 的 loadingTask：除了 promise 还要有 destroy（卸载时会调用）。 */
const loadingTask = (document: unknown) => ({
  promise: Promise.resolve(document),
  destroy: vi.fn(() => Promise.resolve()),
});

const page = (width: number) => ({
  getViewport: ({ scale }: { scale: number }) => ({
    width: width * scale,
    height: 100 * scale,
  }),
  render: () => ({ promise: Promise.resolve(), cancel: () => undefined }),
});

describe('PDF 预览', () => {
  beforeEach(() => {
    getDocument.mockReset();
    // jsdom 没有 canvas 上下文，这里给出最小实现让绘制流程能走完
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      canvas: null,
    } as unknown as CanvasRenderingContext2D);
  });

  it('按 devicePixelRatio 放大绘制，并按容器宽度自适应', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    // 名字不能叫 render：会遮住 testing-library 的 render
    const renderTask = vi.fn(() => ({
      promise: Promise.resolve(),
      cancel: () => undefined,
    }));
    getDocument.mockReturnValue(
      loadingTask({
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            getViewport: ({ scale }: { scale: number }) => ({
              width: 200 * scale,
              height: 100 * scale,
            }),
            render: renderTask,
          }),
      }),
    );

    render(<PdfPreview blob={blob()} />);
    await waitFor(() => expect(document.querySelector('canvas')).toBeTruthy());

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    // 容器宽度（jsdom 里 clientWidth 为 0 → 兜底 120）乘 dpr
    expect(canvas.width).toBe(Math.floor(120 * 2));
    expect(renderTask).toHaveBeenCalledWith(
      expect.objectContaining({ transform: [2, 0, 0, 2, 0, 0] }),
    );
    vi.unstubAllGlobals();
  });

  it('按页画到 canvas 上并给出页数', async () => {
    getDocument.mockReturnValue(
      loadingTask({
        numPages: 2,
        getPage: (number: number) => Promise.resolve(page(number * 100)),
      }),
    );

    render(<PdfPreview blob={blob()} />);

    await waitFor(() => expect(screen.getByText(/共 2 页/)).toBeTruthy());
    const canvases = document.querySelectorAll('canvas');
    expect(canvases).toHaveLength(2);
    expect(canvases[0]).toHaveAttribute('data-page-number', '1');
    // 字节直接用预览接口给的 blob，不再按 URL 取一次
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.any(Uint8Array) }),
    );
  });

  it('加载失败给出可读原因', async () => {
    getDocument.mockReturnValue({
      promise: Promise.reject(new Error('Invalid PDF structure')),
      destroy: vi.fn(() => Promise.resolve()),
    });

    render(<PdfPreview blob={blob()} />);

    expect(
      await screen.findByText('无法加载 PDF 文件或文件格式受损'),
    ).toBeTruthy();
  });

  it('卸载时取消未完成的渲染并销毁加载任务', async () => {
    const cancel = vi.fn();
    const task = loadingTask({
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 100 * scale,
            height: 100 * scale,
          }),
          render: () => ({ promise: new Promise(() => {}), cancel }),
        }),
    });
    getDocument.mockReturnValue(task);

    const { unmount } = render(<PdfPreview blob={blob()} />);
    await waitFor(() => expect(document.querySelector('canvas')).toBeTruthy());

    unmount();
    expect(cancel).toHaveBeenCalled();
    // 销毁 loadingTask 会一并拆掉文档与 worker 连接
    expect(task.destroy).toHaveBeenCalled();
  });
});
