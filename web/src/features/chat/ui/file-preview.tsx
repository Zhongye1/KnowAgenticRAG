/**
 * 文件预览的渲染。
 *
 * 按预览类型分发：markdown 与文本走等宽文本（markdown 的渲染在阶段二换 antd 生态时补），
 * 图片与 PDF 用对象 URL，office 与不支持的类型给出下载提示。状态由 `model/panel-preview` 持有，
 * 这里只渲染并回传关闭 / 下载意图。
 */
import * as React from 'react';
import { Download, Loader2, X } from 'lucide-react';
import styles from './panel-sections.module.css';

import { Button } from 'antd';

import type { PreviewFile } from '@/shared/lib/files';

type FilePreviewProps = {
  file: PreviewFile | null;
  onClose: () => void;
  onDownload?: (file: PreviewFile) => void;
};

const UNSUPPORTED_TEXT = '当前文件暂不支持预览，请下载后查看';

const FilePreview = ({ file, onClose, onDownload }: FilePreviewProps) => {
  if (!file) {
    return <div className={styles.previewCenter}>选择一个文件查看预览</div>;
  }

  const header = (
    <div className={styles.previewHeader}>
      <span className={styles.previewTitle} title={file.path}>
        {file.name}
      </span>
      {onDownload && file.status === 'ready' ? (
        <button
          type="button"
          className={styles.previewBtn}
          aria-label={`下载 ${file.name}`}
          onClick={() => onDownload(file)}
        >
          <Download className="size-3.5" aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        className={styles.previewBtn}
        aria-label={`关闭 ${file.name}`}
        onClick={onClose}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );

  const body = () => {
    if (file.status === 'loading') {
      return (
        <div className={styles.previewCenter}>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          正在加载文件...
        </div>
      );
    }

    if (file.status === 'error') {
      return (
        <div className={`${styles.previewCenter} ${styles.previewError}`}>
          {file.message}
        </div>
      );
    }

    if (file.status === 'unsupported' || !file.supported) {
      return (
        <div className={styles.previewCenter}>
          <span>{file.message || UNSUPPORTED_TEXT}</span>
          {onDownload ? (
            <Button variant="outlined" onClick={() => onDownload(file)}>
              <Download className="size-3.5" aria-hidden />
              下载文件
            </Button>
          ) : null}
        </div>
      );
    }

    if (file.previewType === 'image' && file.previewUrl) {
      return (
        <div className="flex flex-1 items-center justify-center overflow-auto p-2">
          <img
            src={file.previewUrl}
            alt={file.name}
            className="max-h-full max-w-full"
          />
        </div>
      );
    }

    if (file.previewType === 'pdf' && file.previewUrl) {
      return (
        <iframe
          title={file.name}
          src={file.previewUrl}
          className="min-h-0 w-full flex-1 border-0"
        />
      );
    }

    return (
      <pre className={styles.previewBody}>
        {file.content ?? ''}
        {file.truncated ? (
          <span className={styles.previewPlaceholder}>
            文件过大，仅展示前一部分；可下载查看完整内容。
          </span>
        ) : null}
      </pre>
    );
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col p-1"
      aria-label={`文件预览 ${file.name}`}
    >
      {header}
      {file.truncated &&
      file.status === 'ready' &&
      file.previewType !== 'text' ? (
        <div className={styles.notice}>
          文件过大，仅展示前一部分；可下载查看完整内容。
        </div>
      ) : null}
      {body()}
    </div>
  );
};

export { FilePreview, type FilePreviewProps };
