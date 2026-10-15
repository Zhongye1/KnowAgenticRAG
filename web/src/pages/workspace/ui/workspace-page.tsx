/**
 * 个人空间页面。
 *
 * 装配层：控制器（`features/workspace`）接上三段式布局——168px 侧栏 / 文件表 / 预览面板。
 * 页头用 `PageHeader`（fullHeight 页自带水平留白），取数进度条挂页头 loading；
 * 预览在内容区宽于 960px 时内联（可拖拽 30–70%），窄屏走模态；删除确认的三段文案与参照
 * 逐字一致；`/agents` 下页头多一个「使用说明」入口。搜索入口在侧栏「上传文件」上方。
 */
import * as React from 'react';
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';

import { Button, Modal } from 'antd';

import {
  AgentsGuideDialog,
  CreateDirectoryDialog,
  useWorkspaceBrowser,
  WorkspaceFileTable,
  WorkspacePreviewPane,
  WorkspaceSearchModal,
  WorkspaceSidebar,
  type WorkspaceRow,
} from '@/features/workspace';
import type { FileEntry } from '@/shared/lib/files';
import { normalizePathKey } from '@/shared/lib/files';
import { ContentLayout } from '@/shared/ui/content-layout';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { PageHeader } from '@/shared/ui/page-header';
import { useNotifications } from '@/shared/ui/notifications';

import styles from './workspace-page.module.css';

/** 内容区宽于这个值时预览内联，否则走模态；与参照同值。 */
const INLINE_PREVIEW_MIN_WIDTH = 960;
/** 拖拽预览面板的宽度区间（百分比）；与参照同值。 */
const PREVIEW_MIN_PERCENT = 30;
const PREVIEW_MAX_PERCENT = 70;

export const WorkspacePage = () => {
  const { addNotification } = useNotifications();
  const { confirm } = useConfirm();
  const browser = useWorkspaceBrowser({
    notifySuccess: (title) => addNotification({ type: 'success', title }),
    notifyError: (title) => addNotification({ type: 'error', title }),
  });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [previewPercent, setPreviewPercent] = React.useState(50);
  const [resizing, setResizing] = React.useState(false);
  const [mainWidth, setMainWidth] = React.useState(0);

  const mainRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const inlinePreview = mainWidth >= INLINE_PREVIEW_MIN_WIDTH;
  const previewOpen = browser.preview.status !== 'idle';
  const isAgentsPath = normalizePathKey(browser.currentPath) === '/agents';

  // 内容区宽度决定内联还是模态；与参照的 ResizeObserver 同口径
  React.useEffect(() => {
    const node = mainRef.current;
    if (!node) return;
    setMainWidth(node.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => setMainWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const startResize = (event: React.PointerEvent) => {
    if (!inlinePreview) return;
    event.preventDefault();
    const rect = mainRef.current?.getBoundingClientRect();
    if (!rect?.width) return;

    setResizing(true);
    const onMove = (moveEvent: PointerEvent) => {
      const percent = Math.round(
        ((rect.width - moveEvent.clientX + rect.left) / rect.width) * 100,
      );
      setPreviewPercent(
        Math.min(PREVIEW_MAX_PERCENT, Math.max(PREVIEW_MIN_PERCENT, percent)),
      );
    };
    const stop = () => {
      setResizing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  const requestDelete = async (targets: FileEntry[]) => {
    const valid = targets.filter(Boolean);
    if (!valid.length) return;

    const isBatch = valid.length > 1;
    const first = valid[0];
    const title = isBatch
      ? `确认删除选中的 ${valid.length} 项？`
      : first.isDir
        ? `确认删除文件夹「${first.name}」？`
        : `确认删除文件「${first.name}」？`;
    const description =
      isBatch || first.isDir
        ? '将删除文件夹及其所有内容，删除后不可恢复。'
        : '删除后不可恢复。';

    const accepted = await confirm({
      title,
      description,
      confirmText: '删除',
      destructive: true,
    });
    if (!accepted) return;

    await browser.deleteEntries(valid);
  };

  const selectedEntries = browser.rows
    .filter((row) => browser.selectedPaths.includes(row.key))
    .map((row) => row.entry);

  const openEntry = (row: WorkspaceRow) => browser.openEntry(row.entry);

  const previewPane = (
    <WorkspacePreviewPane
      preview={browser.preview}
      saving={browser.saving}
      onClose={browser.closePreview}
      onStartEditing={browser.startEditing}
      onCancelEditing={browser.cancelEditing}
      onChangeDraft={browser.changeDraft}
      onSave={() => void browser.savePreview()}
    />
  );

  return (
    <ContentLayout title="个人空间" fullHeight>
      {/* fullHeight 不吃 ContentLayout 的留白；水平留白与文档流页同款响应式档位，
          顶部 pt-4 让标题落点与其他页一致，纵向贴底是 fullHeight 形态（对话页同款） */}
      <div className={`${styles.view} px-2 pt-4 sm:px-6 md:px-8`}>
        <PageHeader
          title="个人空间"
          loading={browser.isLoading}
          className={styles.header}
          actions={
            isAgentsPath ? (
              <Button
                size="small"
                icon={<HelpCircle size={14} aria-hidden />}
                onClick={() => setGuideOpen(true)}
              >
                使用说明
              </Button>
            ) : undefined
          }
        />

        <div
          className={`${styles.shell} ${
            sidebarCollapsed ? styles.shellCollapsed : ''
          }`}
        >
          {sidebarCollapsed ? null : (
            <div className={styles.sidebarSlot}>
              <WorkspaceSidebar
                currentPath={browser.currentPath}
                uploading={browser.uploading}
                onUploadRequest={() => fileInputRef.current?.click()}
                onCreateDirectory={() => setCreateOpen(true)}
                onSelectRoot={() => browser.openDirectory('/')}
                onSelectPath={(path) => browser.openDirectory(path)}
                onOpenSearch={() => setSearchOpen(true)}
              />
              <button
                type="button"
                className={styles.collapseAction}
                aria-label="收起个人空间侧边栏"
                onClick={() => setSidebarCollapsed(true)}
              >
                <ChevronLeft size={14} aria-hidden />
              </button>
            </div>
          )}

          <div className={styles.main} ref={mainRef}>
            {sidebarCollapsed ? (
              <button
                type="button"
                className={styles.expandAction}
                aria-label="展开个人空间侧边栏"
                onClick={() => setSidebarCollapsed(false)}
              >
                <ChevronRight size={14} aria-hidden />
              </button>
            ) : null}

            <WorkspaceFileTable
              rows={browser.rows}
              breadcrumbs={browser.breadcrumbs}
              currentPath={browser.currentPath}
              isLoading={browser.isLoading}
              selectionMode={browser.selectionMode}
              selectedPaths={browser.selectedPaths}
              deletingPaths={browser.deletingPaths}
              onOpen={openEntry}
              onBreadcrumb={browser.openDirectory}
              onToggleSelectionMode={() =>
                browser.setSelectionMode(!browser.selectionMode)
              }
              onToggleSelection={browser.toggleSelection}
              onDeleteSelected={() => void requestDelete(selectedEntries)}
              onDownload={(row) => void browser.download(row.entry)}
              onDelete={(row) => void requestDelete([row.entry])}
            />

            {/* 面板常驻：宽度在 0 与设定值之间过渡，开与关都有滑入滑出（参照的 enter/leave） */}
            {inlinePreview ? (
              <div
                className={`${styles.previewPanel} ${
                  resizing ? styles.previewPanelResizing : ''
                }`}
                style={{
                  width: previewOpen ? `${previewPercent}%` : 0,
                  opacity: previewOpen ? 1 : 0,
                }}
              >
                <hr
                  className={styles.resizer}
                  aria-label="调整预览宽度"
                  aria-orientation="vertical"
                  onPointerDown={startResize}
                />
                <div className={styles.previewBody}>
                  {previewOpen ? previewPane : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 窄屏：预览走模态（参照在内容区不足 960px 时切到模态形态） */}
      <Modal
        open={!inlinePreview && previewOpen}
        footer={null}
        closable={false}
        width={880}
        onCancel={browser.closePreview}
        styles={{ body: { padding: 0 } }}
      >
        <div className={styles.previewModalBody}>{previewPane}</div>
      </Modal>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void browser.uploadFiles(files);
        }}
      />

      <CreateDirectoryDialog
        open={createOpen}
        creating={browser.creatingDirectory}
        onOpenChange={setCreateOpen}
        onSubmit={browser.createDirectory}
      />

      <AgentsGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />

      <WorkspaceSearchModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(entry) => {
          const parent = entry.path.replace(/\/[^/]+$/, '') || '/';
          browser.openDirectory(parent);
          void browser.openEntry(entry);
        }}
      />
    </ContentLayout>
  );
};
