/**
 * 抽取失败的 Chunk 样例弹窗。
 *
 * 加载态、空态、每个样例展示 `Chunk 序号 / file_id / 尝试次数 / 失败原因 / 原文`，按卡片平铺
 * （后端把 `limit` 夹在 1..10，最多十条）。
 */
import { Spinner } from '@/shared/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

import type { GraphFailedChunkSample } from '../api/graph-api';
import { useGraphFailedChunks } from '../model/graph-queries';

export type GraphFailedChunksDialogProps = {
  kbId: string;
  onOpenChange: (open: boolean) => void;
};

export const GraphFailedChunksDialog = ({
  kbId,
  onOpenChange,
}: GraphFailedChunksDialogProps) => {
  const samples = useGraphFailedChunks(kbId, true);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>样例 Chunk</DialogTitle>
          <DialogDescription>
            最近抽取失败的 Chunk 原文与原因，最多十条。
          </DialogDescription>
        </DialogHeader>

        {samples.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-color-text-2">
            <Spinner />
            正在加载失败 Chunk
          </p>
        ) : samples.isError ? (
          <p role="alert" className="text-sm text-danger-6">
            失败 Chunk 样例加载失败，稍后重试。
          </p>
        ) : (samples.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-color-text-3">暂无抽取失败的 Chunk</p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {(samples.data ?? []).map((sample: GraphFailedChunkSample) => (
              <li
                key={sample.chunk_id}
                className="flex flex-col gap-2 rounded border border-color-border-1 px-3 py-2"
              >
                <div className="flex flex-wrap gap-3 text-xs text-color-text-3">
                  <span>Chunk {Number(sample.chunk_index) + 1}</span>
                  <span>{sample.file_id}</span>
                  <span>尝试 {sample.details?.attempt_count ?? '-'} 次</span>
                </div>
                <p role="alert" className="text-xs text-danger-6">
                  {sample.details?.last_error || '未记录失败原因'}
                </p>
                <pre className="max-h-40 overflow-auto rounded bg-color-fill-1 px-2 py-1 text-xs whitespace-pre-wrap text-color-text-1">
                  {sample.content}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};
