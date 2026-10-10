/**
 * 评估基准预览弹窗：数据集条目（问题 / 标准答案 / 标准 Chunk）分页查看。
 *
 * 条目按后端分页（默认 50）；生成中的数据集后端会拒绝详情请求，因此入口只在可预览时才给。
 */
import * as React from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';

import type { EvaluationDataset } from '../api/evaluation-api';
import {
  isDatasetCompleted,
  datasetKindLabel,
  datasetSourceLabel,
  datasetStatusView,
} from '../lib/evaluation-view';
import { formatFileTableTime } from '../lib/knowledge-files';
import { useEvaluationDataset } from '../model/evaluation-queries';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Spinner } from '@/shared/ui/spinner';

const PAGE_SIZE = 50;

export type BenchmarkDatasetPreviewProps = {
  kbId: string;
  datasetId: string;
  onOpenChange: (open: boolean) => void;
  onDownload: (dataset: EvaluationDataset) => void;
};

export const BenchmarkDatasetPreview = ({
  kbId,
  datasetId,
  onOpenChange,
  onDownload,
}: BenchmarkDatasetPreviewProps) => {
  const [page, setPage] = React.useState(1);
  const detail = useEvaluationDataset(kbId, datasetId, {
    page,
    pageSize: PAGE_SIZE,
  });

  const dataset = detail.data;
  const pagination = dataset?.pagination;
  const totalPages = pagination?.total_pages ?? 0;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[860px]">
        <DialogHeader>
          <DialogTitle>{dataset?.name ?? '评估基准'}</DialogTitle>
          <DialogDescription>
            {dataset
              ? `${datasetKindLabel(dataset)} · ${datasetSourceLabel(dataset.build_metadata)} · ${
                  datasetStatusView(dataset.build_metadata).label
                } · ${dataset.item_count} 个问题`
              : '加载中…'}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="flex h-[320px] items-center justify-center gap-2 text-sm text-color-text-2">
            <Spinner />
            加载中…
          </div>
        ) : detail.isError ? (
          <p role="alert" className="text-sm text-danger-6">
            加载评估基准详情失败：
            {detail.error instanceof Error ? detail.error.message : '未知错误'}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-color-text-3">
              <span>
                {formatFileTableTime(dataset?.created_at)} · 创建人{' '}
                {dataset?.created_by ?? '-'}
              </span>
              <span>
                第 {pagination?.current_page ?? 1} / {totalPages || 1} 页，共{' '}
                {pagination?.total_items ?? 0} 条
              </span>
            </div>

            <ul className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto">
              {(dataset?.items ?? []).map((item) => (
                <li
                  key={item.item_id}
                  className="flex flex-col gap-1 rounded border border-color-border-1 px-3 py-2"
                >
                  <span className="text-sm text-color-text-1">
                    {item.item_index + 1}. {item.query}
                  </span>
                  {item.gold_answer ? (
                    <span className="text-xs text-color-text-3">
                      标准答案：{item.gold_answer}
                    </span>
                  ) : null}
                  {item.gold_chunk_ids.length > 0 ? (
                    <span className="text-xs text-color-text-3">
                      标准 Chunk：{item.gold_chunk_ids.join('、')}
                    </span>
                  ) : null}
                </li>
              ))}
              {(dataset?.items ?? []).length === 0 ? (
                <li className="py-6 text-center text-sm text-color-text-3">
                  这个基准还没有条目。
                </li>
              ) : null}
            </ul>
          </>
        )}

        <DialogFooter className="justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1 || detail.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="size-4" />
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={page >= totalPages || detail.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              下一页
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            {/* 后端只允许导出 completed 的数据集，其它状态下不给入口 */}
            {dataset && isDatasetCompleted(dataset.build_metadata) ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onDownload(dataset as EvaluationDataset)}
              >
                <Download className="size-4" />
                下载 JSONL
              </Button>
            ) : null}
            <Button type="button" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
