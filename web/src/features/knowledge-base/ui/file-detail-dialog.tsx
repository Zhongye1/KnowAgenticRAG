/**
 * 文件详情弹窗。
 *
 * 头部是文件信息，下面按视图切换「源文件 / 解析结果 / 分块」。头部直接用表格行上的记录，
 * 不单独请求 `/documents/{doc_id}/basic`：行上的 `status` 与 `has_original_file` /
 * `has_parsed_markdown` 已经够决定初始视图，多一次请求换不到新信息。
 */
import * as React from 'react';

import type { KnowledgeFileItem } from '../api/knowledge-api';
import {
  canPreviewChunks,
  canPreviewOriginal,
  canPreviewParsed,
  getFileStatusView,
  type FileDetailView,
} from '../lib/knowledge-files';
import { formatBytes, formatCount } from '../lib/knowledge-view';
import { mergeChunks } from '../lib/knowledge-chunks';
import { useFileContent } from '../model/knowledge-queries';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Empty } from '@/shared/ui/empty';
import { Markdown } from '@/shared/ui/markdown';
import { Spinner } from '@/shared/ui/spinner';
import { useIsDarkMode } from '@/shared/lib';

type FileDetailDialogProps = {
  kbId: string;
  /** 打开的文件；弹窗由表格按需挂载，因此这里一定有值。 */
  file: KnowledgeFileItem;
  onOpenChange: (open: boolean) => void;
  /** 首屏视图；调用方按能力矩阵决定，用户切换后由弹窗自己持有。 */
  defaultView?: FileDetailView;
  /** 源文件视图的内容；渲染由调用方提供。 */
  renderSource?: (file: KnowledgeFileItem) => React.ReactNode;
};

const InfoItem = ({ label, value }: { label: string; value: string }) => (
  <span className="flex gap-1 text-xs text-color-text-3">
    <span>{label}</span>
    <span className="text-color-text-2">{value}</span>
  </span>
);

export const FileDetailDialog = ({
  kbId,
  file,
  onOpenChange,
  defaultView = 'markdown',
  renderSource,
}: FileDetailDialogProps) => {
  // 可用视图由预览能力决定：只有源文件的行不该出现
  // 「解析结果 / 分块」，URL 类型也不该出现「源文件」。
  const availableViews = React.useMemo(() => {
    const views: FileDetailView[] = [];
    if (renderSource && canPreviewOriginal(file)) views.push('source');
    if (canPreviewParsed(file)) views.push('markdown');
    if (canPreviewChunks(file)) views.push('chunks');
    return views;
  }, [file, renderSource]);

  const [preferredView, setPreferredView] =
    React.useState<FileDetailView>(defaultView);
  // 首屏视图要落在可用集合里，否则退回第一个可用视图
  const view = availableViews.includes(preferredView)
    ? preferredView
    : (availableViews[0] ?? 'markdown');

  const needsParsedContent = view === 'markdown' || view === 'chunks';
  const content = useFileContent(kbId, file.file_id, {
    enabled: needsParsedContent,
  });
  const statusView = getFileStatusView(file.status);
  const markdownTheme = useIsDarkMode() ? 'github-dark' : 'github-light';

  const merged = React.useMemo(
    () => mergeChunks(content.data?.lines ?? []),
    [content.data?.lines],
  );
  // 服务端给了解析后的 Markdown 就用它，否则用分块合并兜底
  const markdownContent = content.data?.content || merged.content;

  const TAB_LABELS: Record<FileDetailView, string> = {
    source: '源文件',
    markdown: '解析结果',
    chunks: '分块',
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl gap-3"
        data-testid="file-detail-dialog"
      >
        <DialogHeader>
          <DialogTitle className="truncate" title={file.filename}>
            {file.filename}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Badge variant="secondary">{file.file_type || '文件'}</Badge>
              <span
                className={`inline-flex rounded-small px-2 py-0.5 text-xs ${statusView.className}`}
              >
                {statusView.label}
              </span>
            </span>
            <InfoItem label="大小" value={formatBytes(file.file_size)} />
            <InfoItem label="分块" value={formatCount(file.chunk_count)} />
            <InfoItem label="Tokens" value={formatCount(file.token_count)} />
          </DialogDescription>
        </DialogHeader>

        <div
          role="tablist"
          aria-label="文件视图切换"
          className="flex flex-wrap gap-1 border-b border-color-border-1"
        >
          {availableViews.map((key) => (
            <Button
              key={key}
              type="button"
              role="tab"
              variant="ghost"
              size="sm"
              className="rounded-b-none"
              aria-selected={key === view}
              onClick={() => setPreferredView(key)}
            >
              {TAB_LABELS[key]}
            </Button>
          ))}
        </div>

        <div className="max-h-[60vh] min-h-40 overflow-y-auto rounded-large border border-color-border-1 p-3">
          {view === 'source' && renderSource ? renderSource(file) : null}

          {view === 'markdown' ? (
            content.isPending ? (
              <p className="flex items-center gap-2 text-sm text-color-text-3">
                <Spinner aria-hidden className="size-4" />
                正在加载解析结果…
              </p>
            ) : content.isError ? (
              <p role="alert" className="text-sm text-danger-6">
                {content.error instanceof Error
                  ? content.error.message
                  : '加载解析结果失败。'}
              </p>
            ) : markdownContent ? (
              <Markdown
                content={markdownContent}
                theme={markdownTheme}
                className="text-sm text-color-text-1"
              />
            ) : (
              <Empty description="还没有解析结果" />
            )
          ) : null}

          {view === 'chunks' ? (
            content.isPending ? (
              <p className="flex items-center gap-2 text-sm text-color-text-3">
                <Spinner aria-hidden className="size-4" />
                正在加载分块…
              </p>
            ) : content.isError ? (
              <p role="alert" className="text-sm text-danger-6">
                {content.error instanceof Error
                  ? content.error.message
                  : '加载分块失败。'}
              </p>
            ) : merged.chunks.length === 0 ? (
              <Empty
                description={content.data ? '暂无分块信息' : '还没有分块'}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {merged.chunks.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-medium border border-color-border-1 p-2"
                    data-testid="file-chunk"
                  >
                    <p className="text-xs text-color-text-3">
                      #{item.chunk_order_index}
                    </p>
                    <p className="text-sm text-color-text-1">
                      {item.content.replace(/\n+/g, ' ')}
                    </p>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
