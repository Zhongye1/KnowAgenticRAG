/**
 * 上传弹窗。
 *
 * 移植上游 `FileUploadModal.vue` 的文件与文件夹两条路径：拖拽或选择、按并发上限上传、
 * 全部完成后一次性登记并可选自动入库。上游还有 URL 模式与个人空间导入，两者不在本片。
 *
 * 与上游的差异：不做上传字节百分比——本仓走生成的 fetch 客户端拿不到
 * `XMLHttpRequest.upload.onprogress`，队列只报「排队 / 上传中 / 完成 / 失败」四态与计数；
 * 也不弹上游的分块参数面板，解析与入库按知识库自己的配置提交（`params` 只带必要的键）。
 */
import * as React from 'react';
import { FolderUp, Upload } from 'lucide-react';

import {
  useAddDocuments,
  useOcrOptions,
  useSupportedFileTypes,
} from '../model/knowledge-queries';
import {
  buildAddDocumentsParams,
  DEFAULT_SUPPORTED_TYPES,
  getUploadFilename,
  hasOcrImages,
  runUploadPool,
  validateUploadBatch,
  type UploadRejection,
  type UploadStatus,
} from '../lib/knowledge-upload';
import { knowledgeApi } from '../api/knowledge-api';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Empty } from '@/shared/ui/empty';
import { Spinner } from '@/shared/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { useNotifications } from '@/shared/ui/notifications';

type FileUploadDialogProps = {
  kbId: string;
  /** 目标目录：当前浏览的目录，根目录传 `null`。 */
  parentId: string | null;
  parentLabel: string;
  onOpenChange: (open: boolean) => void;
  /** 登记成功后通知调用方：后台任务建记录要一会儿，列表需要延迟重取。 */
  onUploaded?: () => void;
};

const DEFAULT_OCR_ENGINE = 'rapid_ocr';

const STATUS_LABELS: Record<UploadStatus, string> = {
  queued: '排队中',
  uploading: '上传中',
  done: '已上传',
  error: '上传失败',
};

export const FileUploadDialog = ({
  kbId,
  parentId,
  parentLabel,
  onOpenChange,
  onUploaded,
}: FileUploadDialogProps) => {
  const notifications = useNotifications();
  const supported = useSupportedFileTypes();
  const ocr = useOcrOptions();
  const addDocuments = useAddDocuments(kbId);

  const [files, setFiles] = React.useState<File[]>([]);
  const [rejected, setRejected] = React.useState<UploadRejection[]>([]);
  const [statuses, setStatuses] = React.useState<Record<number, UploadStatus>>(
    {},
  );
  // 失败原因按行存：409（同内容）这类原因要能看见
  const [failures, setFailures] = React.useState<Record<number, string>>({});
  const [submitError, setSubmitError] = React.useState('');
  const [autoIndex, setAutoIndex] = React.useState(false);
  // 没选过就用后端给的默认引擎（派生值，不写 state）；选项接口失败时退回内置默认，
  // 否则图片永远传不上去、提示还只说「必须启用 OCR」
  const [pickedEngine, setPickedEngine] = React.useState('');
  const ocrEngine =
    pickedEngine || ocr.data?.default_engine || DEFAULT_OCR_ENGINE;
  const setOcrEngine = setPickedEngine;
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);

  const supportedTypes = supported.data?.length
    ? supported.data
    : [...DEFAULT_SUPPORTED_TYPES];
  const engines = ocr.data?.engines ?? [];

  const accept = supportedTypes.join(',');
  const needsOcr = hasOcrImages(files);

  const onPick = (picked: FileList | null) => {
    if (!picked) return;
    const { accepted, rejected: nextRejected } = validateUploadBatch(
      picked,
      supportedTypes,
    );
    setFiles((current) => [...current, ...accepted]);
    setRejected((current) => [...current, ...nextRejected]);
    setSubmitError('');
  };

  const statusCounts = React.useMemo(() => {
    const counts = { queued: 0, uploading: 0, done: 0, error: 0 };
    Object.values(statuses).forEach((status) => {
      counts[status] += 1;
    });
    return counts;
  }, [statuses]);

  const onSubmit = async () => {
    if (files.length === 0) {
      setSubmitError('请先选择文件。');
      return;
    }

    setBusy(true);
    setSubmitError('');
    setStatuses({});
    setFailures({});
    try {
      const results = await runUploadPool(
        files,
        (file, filename) => knowledgeApi.uploadFile(kbId, file, filename),
        {
          onStatus: (index, status) =>
            setStatuses((current) => ({ ...current, [index]: status })),
        },
      );

      setFailures(
        Object.fromEntries(
          results
            .filter((item) => item.status === 'error' && item.error)
            .map((item) => [item.index, item.error as string]),
        ),
      );

      const uploaded = results
        .filter((item) => item.status === 'done' && item.response?.file_path)
        .map((item) => ({
          index: item.index,
          name: getUploadFilename(item.file),
          file_path: item.response?.file_path as string,
          content_hash: item.response?.content_hash,
          size: item.response?.size ?? item.file.size,
        }));

      if (uploaded.length === 0) {
        const firstReason = results.find(
          (item) => item.status === 'error' && item.error,
        )?.error;
        setSubmitError(
          firstReason
            ? `所有文件都上传失败：${firstReason}`
            : '所有文件都上传失败，请检查后重试。',
        );
        return;
      }

      await addDocuments.mutateAsync({
        items: uploaded.map((item) => item.file_path),
        params: buildAddDocumentsParams(uploaded, {
          ...(parentId ? { parent_id: parentId } : {}),
          ...(autoIndex ? { auto_index: true } : {}),
          // Office（.xls/.xlsx/.pptx）解析时后端要求已解析出 ocr_engine，图片更是必需，
          // 因此只要有引擎就带上，不按「批次里有没有图片」决定
          ...(ocrEngine ? { ocr_engine: ocrEngine } : {}),
        }),
      });

      onUploaded?.();
      const failedCount = files.length - uploaded.length;
      const firstFailure = results.find(
        (item) => item.status === 'error' && item.error,
      )?.error;
      notifications.addNotification({
        type: failedCount > 0 ? 'warning' : 'success',
        title: '知识库',
        message:
          failedCount === 0
            ? `已提交 ${uploaded.length} 个文件处理。`
            : `已提交 ${uploaded.length} 个文件处理，${failedCount} 个上传失败${firstFailure ? `：${firstFailure}` : '。'}`,
      });
      onOpenChange(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : '提交失败，请稍后重试。',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-3"
        data-testid="file-upload-dialog"
        // 上传中不允许 Esc 或点遮罩关掉：关掉后队列还在跑，进度与失败原因就丢了
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>上传文件</DialogTitle>
          <DialogDescription>
            目标目录：{parentLabel}。单个文件不超过 100
            MB，支持的类型由后端下发。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div
            data-testid="upload-dropzone"
            className={`flex flex-col items-center gap-1 rounded-large border border-dashed px-4 py-6 text-center text-xs ${
              dragging
                ? 'border-primary bg-primary-1/40 text-color-text-1'
                : 'border-color-border-2 text-color-text-3'
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (busy) return;
              onPick(event.dataTransfer?.files ?? null);
            }}
          >
            <p>点击下面的按钮选择文件，或把文件拖到这里</p>
            <p>
              文件夹上传会按所选目录逐层入队；后端登记时只保留文件名，不建子目录
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" aria-hidden />
              选择文件
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderUp className="size-4" aria-hidden />
              选择文件夹
            </Button>
            {files.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setFiles([]);
                  setRejected([]);
                  setStatuses({});
                  // 失败原因跟着行走，清了文件就不能再显示上一轮的原因
                  setFailures({});
                }}
              >
                清空
              </Button>
            ) : null}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            aria-label="选择文件"
            className="hidden"
            onChange={(event) => {
              onPick(event.target.files);
              event.target.value = '';
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            aria-label="选择文件夹"
            className="hidden"
            // 文件夹上传要带上相对路径，后端据此投影目录
            {...{ webkitdirectory: '', directory: '' }}
            onChange={(event) => {
              onPick(event.target.files);
              event.target.value = '';
            }}
          />

          {files.length > 0 ? (
            <p className="text-xs text-color-text-3">
              共 {files.length} 个文件
              {statusCounts.done > 0 ? `，已上传 ${statusCounts.done} 个` : ''}
              {statusCounts.error > 0 ? `，失败 ${statusCounts.error} 个` : ''}
            </p>
          ) : null}

          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-large border border-color-border-1 p-1">
            {files.length === 0 ? (
              <Empty description="还没有选择文件" />
            ) : (
              files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  data-testid="upload-row"
                  className="flex items-start gap-2 px-2 py-1 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {getUploadFilename(file)}
                    </span>
                    {failures[index] ? (
                      <span className="block text-xs text-danger-6">
                        {failures[index]}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-color-text-3">
                    {STATUS_LABELS[statuses[index] ?? 'queued']}
                  </span>
                </li>
              ))
            )}
          </ul>

          {rejected.length > 0 ? (
            <ul className="flex flex-col gap-1 text-xs text-danger-6">
              {rejected.map((item) => (
                <li key={item.name}>
                  {item.name}：{item.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-color-text-2">
            <input
              type="checkbox"
              checked={autoIndex}
              disabled={busy}
              onChange={(event) => setAutoIndex(event.target.checked)}
            />
            上传后自动解析并入库
          </label>
          {needsOcr ? (
            <span className="flex items-center gap-2 text-xs text-color-text-2">
              图片需要 OCR：
              <Select
                value={ocrEngine}
                onValueChange={setOcrEngine}
                disabled={busy || engines.length === 0}
              >
                <SelectTrigger aria-label="OCR 引擎" className="w-40">
                  <SelectValue placeholder="选择引擎" />
                </SelectTrigger>
                <SelectContent>
                  {engines.map((engine) => (
                    <SelectItem key={engine.engine_id} value={engine.engine_id}>
                      {engine.display_name ?? engine.engine_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
          ) : null}
        </div>

        {submitError ? (
          <p role="alert" className="text-sm text-danger-6">
            {submitError}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={busy || files.length === 0}
            onClick={() => void onSubmit()}
          >
            {busy ? (
              <>
                <Spinner aria-hidden className="size-4" />
                上传中…
              </>
            ) : (
              '开始上传'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
