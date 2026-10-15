/** 个人空间预览面板。 */
import * as React from 'react';
import { FilePen, FileSearch, LoaderCircle, Maximize2, X } from 'lucide-react';

import { Button, Tooltip } from 'antd';

import type { WorkspacePreview } from '../model/use-workspace-browser';
import { resolveFileIconUrl } from '@/shared/lib/files';
import { Markdown } from '@/shared/ui/markdown';

import styles from './workspace-preview-pane.module.css';

type WorkspacePreviewPaneProps = {
  preview: WorkspacePreview;
  saving: boolean;
  onClose: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onChangeDraft: (value: string) => void;
  onSave: () => void;
};

const PREVIEWABLE_BINARY: ReadonlySet<string> = new Set([
  'image',
  'pdf',
  'html',
]);

export const WorkspacePreviewPane = ({
  preview,
  saving,
  onClose,
  onStartEditing,
  onCancelEditing,
  onChangeDraft,
  onSave,
}: WorkspacePreviewPaneProps) => {
  const [fullscreen, setFullscreen] = React.useState(false);
  const file = preview.file;

  // 全屏时锁滚动
  React.useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  const body = () => {
    if (preview.status === 'loading') {
      return (
        <div className={styles.state}>
          <LoaderCircle size={20} className={styles.spinner} aria-hidden />
          <span>正在加载文件内容...</span>
        </div>
      );
    }

    if (preview.status === 'error' || !file) {
      return <div className={styles.state}>文件读取失败</div>;
    }

    if (preview.editing) {
      return null;
    }

    if (file.status === 'unsupported') {
      return (
        <div className={styles.state}>
          {file.message || '当前文件暂不支持预览，请下载后查看'}
        </div>
      );
    }

    if (PREVIEWABLE_BINARY.has(file.previewType) && file.previewUrl) {
      return file.previewType === 'image' ? (
        <img src={file.previewUrl} alt={file.name} className={styles.image} />
      ) : (
        <iframe
          title={file.name}
          src={file.previewUrl}
          sandbox="allow-scripts"
          className={styles.frame}
        />
      );
    }

    if (file.previewType === 'markdown') {
      return (
        <div className={styles.markdown}>
          <Markdown content={file.content ?? ''} />
        </div>
      );
    }

    return (
      <pre className={styles.code}>
        {file.content ?? ''}
        {file.truncated ? (
          <span className={styles.truncated}>
            （内容过长已截断，完整内容请下载查看）
          </span>
        ) : null}
      </pre>
    );
  };

  const header = (
    <div className={styles.header}>
      <div className={styles.title}>
        <img
          src={resolveFileIconUrl(preview.entry?.path ?? '', {
            isDir: false,
          })}
          alt=""
          className={styles.titleIcon}
        />
        <span className={styles.titlePath} title={preview.entry?.path ?? ''}>
          {preview.entry?.path ?? ''}
        </span>
        {preview.dirty ? <span className={styles.dirty}>未保存</span> : null}
      </div>

      <div className={styles.actions}>
        {preview.canEdit && !preview.editing ? (
          <Tooltip title="编辑">
            <button
              type="button"
              className={styles.actionBtn}
              aria-label="编辑"
              onClick={onStartEditing}
            >
              <FilePen size={16} aria-hidden />
            </button>
          </Tooltip>
        ) : null}
        {preview.editing ? (
          <>
            <Button
              size="small"
              type="primary"
              loading={saving}
              onClick={onSave}
            >
              保存
            </Button>
            <Button size="small" onClick={onCancelEditing}>
              取消
            </Button>
          </>
        ) : null}
        {file ? (
          <Tooltip title="全屏预览">
            <button
              type="button"
              className={styles.actionBtn}
              aria-label="全屏预览"
              onClick={() => setFullscreen(true)}
            >
              <Maximize2 size={16} aria-hidden />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip title="关闭">
          <button
            type="button"
            className={styles.actionBtn}
            aria-label="关闭预览"
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </button>
        </Tooltip>
      </div>
    </div>
  );

  const content = preview.editing ? (
    <textarea
      aria-label="编辑文件内容"
      className={styles.editor}
      value={preview.draft}
      onChange={(event) => onChangeDraft(event.target.value)}
    />
  ) : (
    body()
  );

  if (fullscreen && file) {
    return (
      <dialog open className={styles.overlay} aria-label="文件全屏预览">
        <div className={styles.overlayInner}>
          {header}
          <div className={styles.overlayBody}>{content}</div>
        </div>
      </dialog>
    );
  }

  return (
    <aside className={styles.pane}>
      {header}
      <div className={styles.content}>{content}</div>
    </aside>
  );
};

/** 空态：没有打开任何文件时占位。 */
export const WorkspacePreviewEmpty = () => (
  <aside className={styles.pane}>
    <div className={styles.empty}>
      <FileSearch size={28} aria-hidden />
      <h3>选择文件以预览</h3>
      <p>支持 Markdown、TXT 编辑，其他格式保持只读预览。</p>
    </div>
  </aside>
);
