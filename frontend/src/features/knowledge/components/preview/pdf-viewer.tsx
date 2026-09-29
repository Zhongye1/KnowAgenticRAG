import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
// Vite 的 `?url` 后缀产出的是 URL 字符串（默认导出）；oxlint 看不穿该后缀，
// 故显式豁免 `import/default`。
// oxlint-disable-next-line import/default
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { previewAuthHeaders, previewContentUrl } from '../../api/preview';
import { PreviewCentered, PreviewFrame } from './preview-frame';

/**
 * PDF 预览（kb 落地改造清单 Phase 3 / D55.1）。
 *
 * 三个必须做对的地方：
 *
 * 1. **显式带鉴权头**：PDF.js 用自己的 fetch，不走 axios 拦截器；Range 代理端点
 *    有 `DependsJwtAuth`，不带头就是 401。
 * 2. **`disableAutoFetch: true` + `disableStream: false`**：这是 Range 按需取块的前提。
 *    开着 autoFetch 会把整个文件预取完，Range 就白做了（最易踩的坑）。
 * 3. **不自己算分页边界**：PDF.js 取的是**字节窗口**而非「按页」，它自己按需拉取
 *    （非线性 PDF 的 xref 在文件尾部，首个请求常常不是 `0-`），渲染时只负责页码导航。
 */
// worker 必须在首次 getDocument 之前配好，否则 PDF.js 会退化到主线程解析甚至加载失败
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export const PdfViewer = ({ documentId }: { documentId: string }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 组件卸载或换文档时销毁在途加载任务，避免 PDF.js 内部状态泄漏
    const task = pdfjs.getDocument({
      url: previewContentUrl(documentId),
      httpHeaders: previewAuthHeaders(),
      disableAutoFetch: true,
      disableStream: false,
    });

    task.promise.then(
      (loaded) => {
        if (cancelled) return; // 卸载清理已由下面的 task.destroy() 负责
        setDoc(loaded);
        setPage(1);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );

    return () => {
      cancelled = true;
      // 销毁归 loading task（PDFDocumentProxy 没有 destroy）；
      // 不清理会让每次开关抽屉都留一个 worker 与网络请求。
      void task.destroy();
    };
  }, [documentId]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    void doc.getPage(page).then(async (pdfPage) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const viewport = pdfPage.getViewport({ scale: 1.4 });
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pdfPage.render({ canvas, canvasContext: context, viewport })
        .promise;
    });
    return () => {
      cancelled = true;
    };
  }, [doc, page]);

  if (failed) {
    return (
      <PreviewFrame>
        <PreviewCentered title="预览加载失败，可下载原文件查看" />
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-color-border-2 px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={!doc || page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          <ChevronLeft className="size-4" />
          上一页
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {doc ? `${page} / ${doc.numPages}` : '加载中…'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!doc || page >= doc.numPages}
          onClick={() => setPage((current) => current + 1)}
        >
          下一页
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-2">
        {doc ? (
          <canvas ref={canvasRef} className="max-w-full" />
        ) : (
          <Spinner className="mt-8 size-6" />
        )}
      </div>
    </PreviewFrame>
  );
};
