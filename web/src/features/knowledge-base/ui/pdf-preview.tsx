/**
 * PDF 预览。
 *
 * 把每一页画到 canvas 上，宽度按容器自适应，并按 `devicePixelRatio` 放大绘制保证清晰。字节直接
 * 用预览接口给的 blob（pdfjs 按 URL 再取一次带不上 Authorization）；cmaps 与中日韩字体映射走
 * jsdelivr CDN，离线部署要改成自托管。
 */
import * as React from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';

import { Spinner } from '@/shared/ui/spinner';

type PdfPreviewProps = {
  blob: Blob;
};

type PdfState =
  | { status: 'loading' }
  | { status: 'ready'; pages: number }
  | { status: 'error'; message: string };

/** 容器左右安全边距。 */
const HORIZONTAL_PADDING = 32;

export const PdfPreview = ({ blob }: PdfPreviewProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<PdfState>({ status: 'loading' });

  React.useEffect(() => {
    let cancelled = false;
    const renderTasks: Array<{ cancel: () => void }> = [];
    // 卸载时要回收的句柄：渲染任务、文档、加载任务
    const disposers: Array<() => void> = [];

    const draw = async () => {
      const container = containerRef.current;
      if (!container) return;
      const [pdfjs, workerModule] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const loadingTask = pdfjs.getDocument({
        data: bytes,
        // 中日韩字符的字体映射走 CDN，离线部署要自托管
        cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
        cMapPacked: true,
      });
      disposers.push(() => void loadingTask.destroy());
      // 销毁 loadingTask 会一并拆掉文档与 worker 连接（v6 的 PDFDocumentProxy 没有 destroy）
      const pdfDocument = await loadingTask.promise;
      if (cancelled) return;

      container.replaceChildren();
      const outputScale = window.devicePixelRatio || 1;
      for (
        let pageNumber = 1;
        pageNumber <= pdfDocument.numPages;
        pageNumber += 1
      ) {
        if (cancelled) return;
        const page = await pdfDocument.getPage(pageNumber);
        const unscaled = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(
          container.clientWidth - HORIZONTAL_PADDING,
          120,
        );
        const viewport = page.getViewport({
          scale: availableWidth / unscaled.width,
        });

        const canvas = window.document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = 'mx-auto rounded-small border border-color-border-1';
        canvas.dataset.pageNumber = String(pageNumber);
        container.appendChild(canvas);

        const context = canvas.getContext('2d');
        if (!context) continue;
        const task = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
        });
        renderTasks.push(task);
        await task.promise;
      }
      if (!cancelled) {
        setState({ status: 'ready', pages: pdfDocument.numPages });
      }
    };

    draw().catch((error: unknown) => {
      const name = (error as { name?: string } | null)?.name;
      if (cancelled || name === 'RenderingCancelledException') return;
      setState({ status: 'error', message: '无法加载 PDF 文件或文件格式受损' });
    });

    return () => {
      cancelled = true;
      renderTasks.forEach((task) => task.cancel());
      // 文档与加载任务要显式销毁，否则反复开关 PDF 会在 worker 侧一直累积
      disposers.forEach((dispose) => dispose());
    };
  }, [blob]);

  return (
    <div className="flex flex-col gap-2" data-testid="pdf-preview">
      {state.status === 'loading' ? (
        <p className="flex items-center gap-2 text-sm text-color-text-3">
          <Spinner aria-hidden className="size-4" />
          正在加载 PDF 文档…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm text-danger-6"
        >
          <CircleAlert className="size-4" aria-hidden />
          {state.message}
        </p>
      ) : null}
      {state.status === 'ready' ? (
        <p className="flex items-center gap-2 text-xs text-color-text-3">
          <LoaderCircle className="size-3" aria-hidden />共 {state.pages} 页
        </p>
      ) : null}
      <div ref={containerRef} className="flex flex-col gap-3" />
    </div>
  );
};
