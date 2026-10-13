/**
 * 附件上传弹窗。
 *
 * 对齐参照的 `AttachmentTmpUploadModal`：多选文件后逐个上传到临时区，可对支持解析的条目选解析
 * 方式并解析，最后把可确认的条目绑到会话上。关闭即清空列表（与参照一致）。
 *
 * 解析方式用原生 `<select>`：它是语义正确的可访问控件，而外观本来就要在阶段二换成 antd。
 */
import * as React from 'react';
import { FileText, X } from 'lucide-react';
import styles from './input-selector.module.css';

import { Button } from './antd-button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './antd-dialog';

import { MAX_ATTACHMENT_SIZE_BYTES, type AttachmentItem } from '../lib/attachment-upload';
import type { AttachmentUpload } from '../model/attachment-upload';

type AttachmentUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  upload: AttachmentUpload;
  /** 确认：由调用方负责先把会话准备好，再调用 `upload.confirm`。 */
  onConfirm: () => Promise<void>;
};

const STATUS_LABELS: Record<AttachmentItem['status'], string> = {
  uploading: '上传中',
  uploaded: '已上传',
  parsing: '解析中',
  parsed: '已解析',
  error: '失败',
};

const formatSize = (size: number): string =>
  size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;

export const AttachmentUploadDialog = ({
  open,
  onOpenChange,
  upload,
  onConfirm,
}: AttachmentUploadDialogProps) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      // 关闭即清空：条目只服务于这一次添加
      upload.reset();
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (!upload.canConfirm || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      await onConfirm();
      upload.reset();
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '添加附件失败');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent aria-label="添加附件">
        <DialogHeader>
          <DialogTitle>添加附件</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {/* 参照 a-upload-dragger 的拖拽区形态：整块可点、主文案 + 描述 */}
          <div
            className={styles.dropzone}
            role="button"
            tabIndex={confirming ? -1 : 0}
            aria-disabled={confirming || undefined}
            aria-label="选择附件文件"
            onClick={() => {
              if (confirming) return;
              fileInputRef.current?.click();
            }}
            onKeyDown={(event) => {
              if (confirming) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <p className={styles.dropzoneTitle}>点击或拖拽文件到此处</p>
            <p className={styles.dropzoneDesc}>
              支持任意文件格式，单个不超过{' '}
              {MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)} MB
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            aria-label="选择附件文件输入"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              // 先清 value 再上传：连续选同一个文件也要触发 change
              event.target.value = '';
              if (files.length) void upload.addFiles(files);
            }}
          />

          {upload.items.length ? (
            <ul className={styles.attachmentList}>
              {upload.items.map((item) => (
                <li
                  key={item.localId}
                  className={styles.attachmentItem}
                >
                  <span className={styles.attachmentFileIcon} aria-hidden>
                    <FileText className="size-4" />
                  </span>
                  <div className={styles.attachmentItemContent}>
                    <div className={styles.attachmentNameRow}>
                      <span className={styles.attachmentName} title={item.fileName}>
                        {item.fileName}
                      </span>
                      <button
                        type="button"
                        className={styles.attachmentRemove}
                        aria-label={`移除 ${item.fileName}`}
                        disabled={confirming}
                        onClick={() => upload.remove(item.localId)}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </div>

                  {/* 参照 .attachment-status-row：大小与状态在一行 */}
                  <div className={styles.attachmentStatusRow}>
                    <span className={styles.attachmentMeta}>
                      {formatSize(item.fileSize)}
                    </span>
                    <span className={styles.attachmentMeta}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>

                  {item.parseSupported ? (
                    <div className={styles.attachmentParseControls}>
                      <label
                        className={styles.attachmentStatus}
                        htmlFor={`parse-${item.localId}`}
                      >
                        解析方式
                      </label>
                      <select
                        id={`parse-${item.localId}`}
                        className={styles.attachmentSelect}
                        value={item.selectedParseMethod ?? ''}
                        aria-label={`${item.fileName} 的解析方式`}
                        // 解析中换方式会让旧引擎的结果盖住新选择，因此解析期间锁住
                        disabled={item.status === 'parsing' || confirming}
                        onChange={(event) => {
                          // 换方式就丢掉上一次的解析结果，它对应的不是当前方式
                          upload.setParseMethod(item.localId, event.target.value);
                        }}
                      >
                        {item.parseMethods.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                      <Button

                        variant="ghost"
                        disabled={
                          item.status === 'parsing' ||
                          confirming ||
                          !item.selectedParseMethod
                        }
                        onClick={() => void upload.parse(item)}
                      >
                        解析
                      </Button>
                    </div>
                  ) : null}

                  {item.error ? (
                    <p className={styles.optionError}>{item.error}</p>
                  ) : null}
                  {item.parseError ? (
                    <p className={styles.optionError}>{item.parseError}</p>
                  ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? <p className={styles.optionError}>{error}</p> : null}

          <DialogFooter>
            <Button  variant="ghost" onClick={() => close(false)}>
              取消
            </Button>
            <Button

              disabled={!upload.canConfirm || confirming}
              onClick={() => void submit()}
            >
              添加
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
