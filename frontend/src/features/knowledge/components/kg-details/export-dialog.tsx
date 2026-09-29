import { CircleAlert, CircleCheck, Download, PackageOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { getApiErrorMessage } from '@/lib/api-error';

import {
  isExportTerminal,
  useCreateKbExport,
  useKbExport,
  useKbExports,
} from '../../api/export';

/**
 * 整库导出对话框（kb 落地改造清单 §9.2）。
 *
 * 产物是**异步**打出来的，所以对话框有三态：未发起 / 打包中（轮询）/ 完成或失败。
 * 完成后走预签名 URL 下载——ZIP 字节不流经 API 进程。
 */

// 生成类型里 size_bytes 是可选的（后端有默认值），`!bytes` 同时覆盖 undefined 与 0
const formatBytes = (bytes: number | undefined) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export function ExportDialog({
  kbName,
  open,
  onOpenChange,
}: {
  kbName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [exportId, setExportId] = useState<string | null>(null);
  const history = useKbExports(kbName);
  const current = useKbExport({ kbName, exportId, enabled: open });
  const createMutation = useCreateKbExport();

  // 关闭再打开时回到「可发起」态，避免停留在上一次的产物上
  useEffect(() => {
    if (!open) setExportId(null);
  }, [open]);

  const status = current.data?.status;
  const busy = status === 'pending' || status === 'running';

  const start = () => {
    createMutation.mutate(
      { kb_name: kbName },
      { onSuccess: (data) => setExportId(data.export_id) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <PackageOpen className="size-4" />
            导出知识库
          </DialogTitle>
          <DialogDescription className="text-xs">
            打包原文件、解析文本与 manifest 元数据（含授权条目）为 ZIP。
            产物在服务端异步生成，完成后可下载。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="rounded-large border border-color-border-2 bg-color-bg-2 px-3 py-2 text-muted-foreground">
            <p className="font-medium text-foreground">包含内容</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>manifest.json —— 知识库与文档元数据、文档级授权</li>
              <li>documents/ —— 上传的原始文件</li>
              <li>parsed/ —— 解析后的 Markdown</li>
            </ul>
          </div>

          {busy ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner className="size-4" />
              正在打包，请稍候（大库可能需要几分钟）…
            </div>
          ) : null}

          {status === 'success' && current.data?.url ? (
            <div className="flex items-center justify-between gap-2 rounded-large border border-color-border-2 px-3 py-2">
              <span className="flex items-center gap-1.5 text-foreground">
                <CircleCheck className="size-4" />
                已完成 · {current.data.document_count} 篇 ·{' '}
                {formatBytes(current.data.size_bytes)}
              </span>
              <Button size="sm" variant="outline" asChild>
                <a
                  href={current.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="size-4" />
                  下载
                </a>
              </Button>
            </div>
          ) : null}

          {status === 'failed' ? (
            <div className="flex items-start gap-2 rounded-large border border-color-border-2 px-3 py-2 text-muted-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>导出失败：{current.data?.error ?? '未知原因'}</span>
            </div>
          ) : null}

          {createMutation.isError ? (
            <div className="flex items-start gap-2 text-muted-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{getApiErrorMessage(createMutation.error)}</span>
            </div>
          ) : null}

          {history.data?.length ? (
            <details className="rounded-large border border-color-border-2 px-3 py-2">
              <summary className="cursor-pointer text-muted-foreground">
                历史导出
              </summary>
              <ul className="mt-2 space-y-1">
                {history.data.map((item) => (
                  <li
                    key={item.export_id}
                    className="flex justify-between gap-2"
                  >
                    <span className="truncate font-mono text-[11px]">
                      {item.export_id.slice(0, 8)}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {isExportTerminal(item.status) ? item.status : '打包中'} ·{' '}
                      {formatBytes(item.size_bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            关闭
          </Button>
          <Button
            size="sm"
            disabled={busy || createMutation.isPending}
            onClick={start}
          >
            {createMutation.isPending ? '正在提交…' : '开始导出'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
