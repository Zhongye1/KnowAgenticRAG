import { Spinner } from '@/components/ui/spinner';

import type { PreviewItem } from '@/generated/types';
import { PdfViewer } from './pdf-viewer';
import { PreviewCentered, PreviewFrame } from './preview-frame';
import { TextViewer } from './text-viewer';
import { ImageViewer } from './image-viewer';

/**
 * 文档预览分发器（kb 落地改造清单 Phase 3 / D55）。
 *
 * 按后端返回的 `kind` / `status` 分流——**判定权在服务端**（按扩展名，且不信任上传的
 * `Content-Type`），前端不重复实现一套扩展名表，避免两边判断漂移。
 *
 * - `pdf`    → Range 代理 + PDF.js
 * - `office` → 首次访问触发异步转换，返回 `converting` 时轮询（D55.2）
 * - `markdown` / `text` → 内联窗口 + 续读
 * - `image`  → 预签名直连
 * - `degraded` → Office 转换失败时后端已把 kind 改写为 markdown，此处只提示
 * - `unsupported` / `failed` → 明确告知只能下载，不做假预览
 */
export const DocumentPreview = ({
  preview,
  onLoadMore,
  isFetchingMore,
}: {
  preview: PreviewItem | undefined;
  onLoadMore: () => void;
  isFetchingMore: boolean;
}) => {
  if (!preview) {
    return (
      <PreviewFrame>
        <PreviewCentered title="正在获取预览…" />
      </PreviewFrame>
    );
  }

  if (preview.status === 'converting') {
    return (
      <PreviewFrame>
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <Spinner className="size-5" />
          <p className="text-xs">正在转换原文件版式，稍候自动刷新…</p>
        </div>
      </PreviewFrame>
    );
  }

  if (preview.kind === 'pdf' && preview.content_url) {
    return <PdfViewer documentId={preview.document_id} />;
  }

  if (preview.kind === 'image') {
    return <ImageViewer preview={preview} />;
  }

  if (preview.kind === 'markdown' || preview.kind === 'text') {
    return (
      <TextViewer
        preview={preview}
        onLoadMore={onLoadMore}
        isFetchingMore={isFetchingMore}
      />
    );
  }

  // unsupported / failed：如实告知，不假装能预览
  return (
    <PreviewFrame>
      <PreviewCentered
        title={preview.fallback_reason ?? '该类型暂不支持内嵌预览，可下载查看'}
      />
    </PreviewFrame>
  );
};
