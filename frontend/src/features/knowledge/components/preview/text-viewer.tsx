import { MDPreview } from '@/components/ui/md-preview';
import { Button } from '@/components/ui/button';

import type { PreviewItem } from '@/generated/types';
import { PreviewFrame } from './preview-frame';

/**
 * Markdown / 纯文本内联预览（kb 落地改造清单 Phase 3 / D55 §3A）。
 *
 * 后端按**字节窗口**返回内容并给出 `next_offset`：文本可能很大，一次不拉全量。
 * Markdown 走 `MDPreview`（内含 DOMPurify 清洗）；纯文本用 `<pre>` 原样保留空白。
 */
export const TextViewer = ({
  preview,
  onLoadMore,
  isFetchingMore,
}: {
  preview: PreviewItem;
  onLoadMore: () => void;
  isFetchingMore: boolean;
}) => {
  const isMarkdown = preview.kind === 'markdown';
  return (
    <PreviewFrame className="flex flex-col">
      <div className="flex-1 overflow-auto p-2">
        {isMarkdown ? (
          <MDPreview value={preview.content ?? ''} />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
            {preview.content ?? ''}
          </pre>
        )}
      </div>
      {preview.next_offset != null ? (
        <div className="flex items-center justify-between gap-2 border-t border-color-border-2 px-2 py-1.5">
          <span className="text-[11px] text-muted-foreground">
            已显示 {preview.next_offset} / {preview.total_bytes ?? '?'} 字节
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={isFetchingMore}
            onClick={onLoadMore}
          >
            加载更多
          </Button>
        </div>
      ) : null}
    </PreviewFrame>
  );
};
