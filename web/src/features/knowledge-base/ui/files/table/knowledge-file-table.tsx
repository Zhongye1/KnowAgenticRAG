/**
 * 知识库文件表。
 *
 * 面包屑与目录进入、状态筛选、按列的客户端排序（对当前页排序）、服务端分页（100/300/500）、
 * 刷新与空态，行内操作（下载 / 解析或入库 / 重新入库 / 移动 / 删除）与批量操作（批量解析 /
 * 入库 / 删除）。
 */
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTable, type SortingState } from '@tanstack/react-table';
import {
  ArrowUpDown,
  ChevronRight,
  Home,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import { Button, Select, Spin } from 'antd';

import type { KnowledgeFileItem } from '../../../api/knowledge-api';
import { getDefaultDetailView } from '../../../lib/knowledge-files';
import { formatBytes, formatCount } from '../../../lib/knowledge-view';
import {
  canDragKnowledgeFile,
  canDropKnowledgeFileIntoFolder,
  canSelectFile,
  isProcessingFile,
  FILE_PAGE_SIZE_OPTIONS,
  FILE_STATUS_FILTER_OPTIONS,
} from '../../../lib/knowledge-files';
import type { FileCrumb } from '../../../model/file-view';
import { openLocation, type FileView } from '../../../model/file-view';
import {
  knowledgeKeys,
  useKnowledgeBase,
  useKnowledgeFiles,
  useVirtualFolderStatus,
} from '../../../model/knowledge-queries';
import { useFileActions } from '../../../model/use-file-actions';
import { FileDetailDialog } from '../dialogs/file-detail-dialog';
import { FileUploadDialog } from '../dialogs/file-upload-dialog';
import { FilePanelHeader } from '../panel/file-panel-header';
import { FilePreview as FilePreviewPane } from '../preview/file-preview';
import { fileColumns, tableFeatureSet } from './file-table-columns';
import { FolderNameDialog } from '../dialogs/folder-name-dialog';
import { MoveFileDialog } from '../dialogs/move-file-dialog';
import { VirtualFolderDialog } from '../dialogs/virtual-folder-dialog';
import { Empty } from '@/shared/ui/empty';
import {
  TableBody,
  TableCell,
  // 注意：同名的 `Table` 是简易表格组件（{data, columns} 形态），
  // 这里要的是表格原语 `TableElement`
  TableElement,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

/** 有文件在处理中时的轮询间隔（不做退避）。 */
const PROCESSING_POLL_MS = 10_000;

/**
 * 刚提交完上传后的轮询窗口。
 *
 * 三阶段 ingest 是后台任务，`POST /documents` 返回 `queued` 时文件记录还没建出来，
 * 立刻重取看不到新文件，这段窗口内保持轮询。
 */
const UPLOAD_SETTLE_MS = 60_000;

/**
 * 轮询判定：拿查询自己上一份数据判断有没有处理中的行，另外在刚上传完的窗口里也轮询。
 * 用函数形式而不是把间隔提出来算——间隔要在数据到达之后才知道，提出来只能等到下一次渲染。
 */
export const shouldPollFiles = (
  query: { state: { data?: { items?: KnowledgeFileItem[] } } },
  uploadedAt = 0,
): number | false => {
  const processing = (query.state.data?.items ?? []).some((item) =>
    isProcessingFile(item),
  );
  if (processing) return PROCESSING_POLL_MS;
  return Date.now() - uploadedAt < UPLOAD_SETTLE_MS
    ? PROCESSING_POLL_MS
    : false;
};

/** 空列表常量：每次渲染新建数组会让表格库的 memo 失效。 */
const EMPTY_ITEMS: KnowledgeFileItem[] = [];
const EMPTY_IDS: string[] = [];

type KnowledgeFileTableProps = {
  kbId: string;
  view: FileView;
  onViewChange: (view: FileView) => void;
  /** 打开文件名搜索的入口（弹窗由页面渲染，表格只负责触发）。 */
  onOpenSearch?: () => void;
  /** 只读知识库：隐藏写入口，只留下载与浏览。 */
  readOnly?: boolean;
};

export const KnowledgeFileTable = ({
  kbId,
  view,
  onViewChange,
  onOpenSearch,
  readOnly = false,
}: KnowledgeFileTableProps) => {
  const { location, status, page } = view;
  const { parentId, pathPrefix, crumbs } = location;
  const [pageSize, setPageSize] = React.useState<number>(100);
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const queryClient = useQueryClient();
  // 刚提交完上传的一段时间里也要轮询：后台任务建记录要一会儿
  const [uploadedAt, setUploadedAt] = React.useState(0);
  // 有处理中的行时轮询，让「待解析 → 解析中 → 已入库」自己推进
  const files = useKnowledgeFiles(
    kbId,
    { parentId, pathPrefix, status, page, pageSize },
    { refetchInterval: (query) => shouldPollFiles(query, uploadedAt) },
  );
  const items = files.data?.items ?? EMPTY_ITEMS;
  const total = files.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // keepPreviousData 保留的是上一个查询键那一页，切目录/翻页期间它不是当前内容
  const showingStaleRows = files.isPlaceholderData;

  /**
   * 进入一个目录行。
   *
   * 真实目录用它的 file_id；虚拟目录（来源路径投影）没有实体记录，必须改成
   * 「父目录 + 路径前缀」，否则后端会把它当实体父目录查不到而报 400。
   * 状态筛选与页码由 `openLocation` 一起归位：筛状态走的是跨目录查询，父目录与前缀都不生效。
   */
  const enterFolder = React.useCallback(
    (item: KnowledgeFileItem) => {
      const crumb: FileCrumb = item.is_virtual_folder
        ? {
            fileId: item.parent_id ?? null,
            pathPrefix: item.path_prefix ?? '',
            filename: item.filename,
          }
        : { fileId: item.file_id, pathPrefix: '', filename: item.filename };
      onViewChange(
        openLocation({
          parentId: crumb.fileId,
          pathPrefix: crumb.pathPrefix,
          crumbs: [...crumbs, crumb],
        }),
      );
    },
    [crumbs, onViewChange],
  );

  const gotoCrumb = (index: number) => {
    // index = -1 表示根
    const target = index < 0 ? null : (crumbs[index] ?? null);
    onViewChange(
      openLocation({
        parentId: target?.fileId ?? null,
        // 每一节自带定位信息，虚拟层也能被还原
        pathPrefix: target?.pathPrefix ?? '',
        crumbs: crumbs.slice(0, Math.max(index + 1, 0)),
      }),
    );
  };

  /**
   * 勾选跟着「当前视图」走：翻页或换目录后旧选择不再生效，避免把看不见的行提交出去。
   * 选择连同它所属的视图键一起存，读到不匹配的键就当作空选择。
   */
  const viewKey = `${parentId ?? 'root'}|${pathPrefix}|${status}|${page}|${pageSize}`;
  const [selection, setSelection] = React.useState<{
    key: string;
    ids: string[];
  }>({ key: viewKey, ids: [] });
  const selectedIds = selection.key === viewKey ? selection.ids : EMPTY_IDS;
  const setSelectedIds = React.useCallback(
    (ids: string[]) => setSelection({ key: viewKey, ids }),
    [viewKey],
  );
  const [moveTarget, setMoveTarget] = React.useState<KnowledgeFileItem | null>(
    null,
  );
  const [detailFile, setDetailFile] = React.useState<KnowledgeFileItem | null>(
    null,
  );
  const [uploadOpen, setUploadOpen] = React.useState(false);
  // 面板首行的两个弹窗：新建（含子文件夹）与重命名
  const [folderDialog, setFolderDialog] = React.useState<
    | { mode: 'create'; parentId: string | null }
    | { mode: 'rename'; file: KnowledgeFileItem }
    | null
  >(null);
  const [virtualFolderOpen, setVirtualFolderOpen] = React.useState(false);

  // 虚拟文件夹状态只有管理员才检测（转换入口只给他们）
  const virtualFolders = useVirtualFolderStatus(kbId, {
    enabled: !readOnly,
  });
  const stats = useKnowledgeBase(kbId);

  const clearSelection = React.useCallback(
    () => setSelectedIds([]),
    [setSelectedIds],
  );

  /**
   * 写操作的编排（mutate + 通知 + 确认 + 分批 + 门禁）在 `model/use-file-actions.ts`：
   * 这里只把视图事实喂进去——当前页的行与选择、表里是不是上一个目录的行，以及拖拽移动
   * 不成立的两个场景（跨目录筛选、虚拟层）。
   */
  const {
    locked,
    canMutate,
    batchBusy,
    repairing: repairingStats,
    folderBusy,
    canBatchParse,
    canBatchIndex,
    canBatchDelete,
    notify,
    notifyDone,
    notifyError,
    download,
    submitTask,
    deleteOne,
    moveOne,
    createFolder,
    renameFolder,
    batchTask,
    batchDelete,
    parsePending,
    indexPending,
    repairStats,
  } = useFileActions({
    kbId,
    readOnly,
    items,
    selectedIds,
    stale: showingStaleRows,
    filtered: status !== 'all',
    virtualPath: pathPrefix !== '',
    clearSelection,
  });

  /**
   * 拖拽移动。三层门禁由 `lib/knowledge-files` 的纯函数判定，判据（只读、锁定、
   * 筛选态、虚拟层）由编排层给出。
   */
  const [dragged, setDragged] = React.useState<KnowledgeFileItem | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = React.useState<string | null>(
    null,
  );
  const resetDrag = () => {
    setDragged(null);
    setDragOverFolderId(null);
  };

  /**
   * 刷新：重取当前页，并让详情失效——统计按钮里的待解析/待入库数量随解析与入库变化。
   */
  const handleRefresh = () => {
    void files.refetch();
    void queryClient.invalidateQueries({
      queryKey: knowledgeKeys.detail(kbId),
    });
  };

  /** 当前页可勾选的行：批量条与表头全选都以它为准（全选 = 当前页）。 */
  const selectableOnPage = React.useMemo(
    () => items.filter((item) => canSelectFile(item, locked)),
    [items, locked],
  );
  const allSelected =
    selectableOnPage.length > 0 &&
    selectableOnPage.every((item) => selectedIds.includes(item.file_id));
  const someSelected =
    !allSelected &&
    selectableOnPage.some((item) => selectedIds.includes(item.file_id));

  const columns = React.useMemo(
    () =>
      fileColumns({
        readOnly,
        locked,
        stale: showingStaleRows,
        enterFolder,
        openDetail: setDetailFile,
        operations: {
          download: (file) => void download(file),
          parse: (file) => void submitTask('parse', file),
          index: (file) => void submitTask('index', file),
          move: setMoveTarget,
          delete: (file) => void deleteOne(file),
          renameFolder: (file) => setFolderDialog({ mode: 'rename', file }),
          createSubfolder: (file) =>
            setFolderDialog({ mode: 'create', parentId: file.file_id }),
        },
        selection: {
          selectedIds,
          selectableOnPage,
          allSelected,
          someSelected,
          setSelectedIds,
        },
      }),
    // 行内操作的处理器每次渲染都是新的闭包，列定义跟着它们重建
    [
      enterFolder,
      showingStaleRows,
      readOnly,
      locked,
      deleteOne,
      download,
      submitTask,
      allSelected,
      someSelected,
      selectableOnPage,
      selectedIds,
      setSelectedIds,
    ],
  );

  const table = useTable({
    features: tableFeatureSet,
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  });

  return (
    <div className="flex flex-col gap-3 py-2">
      {/* 面板首行在卡片外 */}
      {/* 左边上传下拉、右边统计按钮排。
          统计来自详情查询；虚拟文件夹转换的进度弹窗也由本组件持有 */}
      <FilePanelHeader
        testId="file-panel-header"
        canManage={!readOnly}
        busy={batchBusy || locked}
        repairing={repairingStats}
        stats={{
          pendingParseCount: stats.data?.stats.pending_parse_count ?? 0,
          pendingIndexCount: stats.data?.stats.pending_index_count ?? 0,
          fileCount: stats.data?.stats.file_count ?? 0,
          sizeText:
            (stats.data?.stats.total_size ?? 0) > 0
              ? formatBytes(stats.data?.stats.total_size ?? 0)
              : '',
          chunkText: formatCount(stats.data?.stats.chunk_count ?? 0),
          tokenText: formatCount(stats.data?.stats.token_count ?? 0),
          hasVirtualFolders: virtualFolders.data?.has_virtual_folders ?? false,
        }}
        actions={{
          onBatchParse: () => void parsePending(),
          onBatchIndex: () => void indexPending(),
          onConvertVirtualFolders: () => setVirtualFolderOpen(true),
          onRepairStats: () => void repairStats(),
          onUploadFiles: () => setUploadOpen(true),
          onCreateFolder: () => setFolderDialog({ mode: 'create', parentId }),
        }}
      />

      {/* FileTable 的根就是这个卡片——12px 圆角 + gray-150 边框、
          裁剪溢出，并自称具名容器，工具栏按容器宽度（不是视口）决定收不收进溢出菜单 */}
      <div className="@container/file-table flex flex-col gap-2 overflow-hidden rounded-[12px] border border-[var(--gray-150)] bg-[var(--gray-0)] p-2">
        {!readOnly && selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-large border border-color-border-1 bg-color-bg-1 px-3 py-2">
            <span className="text-xs text-color-text-2">
              已选 {selectedIds.length} 项
            </span>
            <Button
              htmlType="button"
              variant="text"

              disabled={!canBatchParse}
              onClick={() => void batchTask('parse')}
            >
              批量解析
            </Button>
            <Button
              htmlType="button"
              variant="text"

              disabled={!canBatchIndex}
              onClick={() => void batchTask('index')}
            >
              批量入库
            </Button>
            <Button
              htmlType="button"
              variant="text"

              className="text-danger-6"
              disabled={!canBatchDelete}
              onClick={() => void batchDelete()}
            >
              批量删除
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {status === 'all' ? (
            <nav
              className="flex min-w-0 flex-1 items-center gap-1 text-xs text-color-text-3"
              aria-label="文件路径"
            >
              <Button
                htmlType="button"
                variant="text"

                aria-label="回到根目录"
                onClick={() => gotoCrumb(-1)}
                // 根目录也是落点：拖到它上面等于移到根
                {...(canMutate && dragged
                  ? {
                      onDragOver: (event: React.DragEvent) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                      },
                      onDrop: (event: React.DragEvent) => {
                        event.preventDefault();
                        const file = dragged;
                        resetDrag();
                        void moveOne(file, null);
                      },
                    }
                  : {})}
              >
                <Home className="size-3" aria-hidden />
                根目录
              </Button>
              {crumbs.map((crumb, index) => (
                <React.Fragment key={`${crumb.fileId ?? 'root'}-${index}`}>
                  <ChevronRight className="size-3 shrink-0" aria-hidden />
                  <button
                    type="button"
                    className="max-w-40 truncate border-0 bg-transparent p-0 hover:text-color-text-1"
                    title={crumb.filename}
                    onClick={() => gotoCrumb(index)}
                  >
                    {crumb.filename}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          ) : (
            // 筛选是跨目录查询，此时路径与列表内容无关，显示路径会误导
            <p className="min-w-0 flex-1 text-xs text-color-text-3">
              跨全部目录筛选
            </p>
          )}

          <div className="flex items-center gap-2">
            <Select
              value={status}
              onChange={(value) => {
                // 换筛选就是换一份结果集，页码必须归位
                onViewChange({ ...view, status: value, page: 1 });
              }}
              aria-label="按状态筛选文件"
              style={{ width: 128 }}
              virtual={false}
              options={[
                { value: 'all', label: '全部状态' },
                ...FILE_STATUS_FILTER_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                })),
              ]}
            />

            {onOpenSearch ? (
              <Button
                htmlType="button"
                variant="outlined"
                onClick={onOpenSearch}
              >
                <Search className="size-4" aria-hidden />
                搜索文件
              </Button>
            ) : null}

            {readOnly ? null : (
              <Button
                htmlType="button"
                variant="outlined"

                disabled={showingStaleRows}
                onClick={() => setUploadOpen(true)}
              >
                <Upload className="size-4" aria-hidden />
                上传文件
              </Button>
            )}

            <Button
              htmlType="button"
              variant="outlined"

              aria-label="刷新文件列表"
              disabled={files.isFetching}
              onClick={handleRefresh}
            >
              <RefreshCw
                className={`size-4 ${files.isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>

        {status !== 'all' ? (
          <p className="text-xs text-color-text-3">
            按状态筛选时跨全部目录，忽略当前路径；进入目录会回到全部状态。
          </p>
        ) : null}

        {readOnly ? (
          <p className="text-xs text-color-text-3">
            当前账号对该知识库只有读取权限。
          </p>
        ) : null}

        {files.isPending || showingStaleRows ? (
          <p className="flex items-center gap-2 py-2 text-xs text-color-text-3">
            <Spin aria-hidden className="size-4" />
            正在加载文件…
          </p>
        ) : null}

        {files.isError ? (
          <div className="flex flex-col items-start gap-2 py-6">
            <p role="alert" className="text-sm text-danger-6">
              {files.error instanceof Error
                ? files.error.message
                : '加载文件失败。'}
            </p>
            <Button
              htmlType="button"
              variant="outlined"
              onClick={() => void files.refetch()}
            >
              重试
            </Button>
          </div>
        ) : null}

        {files.isError ? null : (
          <div
            className={showingStaleRows ? 'opacity-60' : undefined}
            aria-busy={showingStaleRows || undefined}
          >
            <TableElement>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        // 12px/600/gray-500、
                        // 8px 10px 内边距、gray-100 下边框、sticky
                        className="sticky top-0 z-[2] border-b border-[var(--gray-100)] bg-[var(--gray-0)] px-2.5 py-2 text-xs leading-[18px] font-semibold text-[var(--gray-500)]"
                        aria-sort={
                          header.column.getIsSorted() === 'asc'
                            ? 'ascending'
                            : header.column.getIsSorted() === 'desc'
                              ? 'descending'
                              : undefined
                        }
                      >
                        {header.column.getCanSort() ? (
                          <button
                            type="button"
                            className="flex items-center border-0 bg-transparent p-0 gap-1"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <table.FlexRender header={header} />
                            <ArrowUpDown className="size-3" aria-hidden />
                            <span className="sr-only">
                              {header.column.getIsSorted() === 'asc'
                                ? '已升序'
                                : header.column.getIsSorted() === 'desc'
                                  ? '已降序'
                                  : '未排序'}
                            </span>
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => {
                  const rowFile = row.original;
                  const draggable = canDragKnowledgeFile({
                    enabled: canMutate,
                    file: rowFile,
                    crumbs,
                    files: items,
                  });
                  const dropTarget =
                    canDropKnowledgeFileIntoFolder(dragged, rowFile) &&
                    canMutate;
                  return (
                    <TableRow
                      key={row.id}
                      data-testid="file-row"
                      // 行不带下边框：分隔线落在单元格上
                      className="border-b-0 hover:bg-[var(--main-20)] data-[state=selected]:bg-[var(--main-20)]"
                      {...(draggable
                        ? {
                            draggable: true,
                            onDragStart: (
                              event: React.DragEvent<HTMLTableRowElement>,
                            ) => {
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData(
                                'text/plain',
                                rowFile.file_id,
                              );
                              setDragged(rowFile);
                            },
                            onDragEnd: resetDrag,
                          }
                        : {})}
                      {...(dropTarget
                        ? {
                            'data-drop-target': 'true',
                            onDragOver: (
                              event: React.DragEvent<HTMLTableRowElement>,
                            ) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                              setDragOverFolderId(rowFile.file_id);
                            },
                            onDragLeave: (
                              event: React.DragEvent<HTMLTableRowElement>,
                            ) => {
                              if (
                                event.currentTarget.contains(
                                  event.relatedTarget as Node | null,
                                )
                              ) {
                                return;
                              }
                              if (dragOverFolderId === rowFile.file_id) {
                                setDragOverFolderId(null);
                              }
                            },
                            onDrop: (
                              event: React.DragEvent<HTMLTableRowElement>,
                            ) => {
                              event.preventDefault();
                              const file = dragged;
                              resetDrag();
                              void moveOne(file, rowFile.file_id);
                            },
                            className:
                              dragOverFolderId === rowFile.file_id
                                ? 'bg-[var(--main-20)]'
                                : undefined,
                          }
                        : {})}
                    >
                      {row.getAllCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          // 13px/gray-700、
                          // 7px 10px 内边距、gray-50 分隔线
                          className="border-b border-[var(--gray-50)] bg-[var(--gray-0)] px-2.5 py-[7px] text-[13px] leading-5 text-[var(--gray-700)]"
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </TableElement>
            {/* 空库时表头照常渲染、空态落在表体位置：列有哪些、能做什么仍然看得见 */}
            {!showingStaleRows && files.isSuccess && items.length === 0 ? (
              <Empty description="暂无文件" />
            ) : null}
          </div>
        )}

        {total > 0 ? (
          <div className="flex items-center justify-between gap-2 text-xs text-color-text-3">
            <span>
              共 {total} 条，第 {page} / {totalPages} 页
            </span>
            <span className="flex items-center gap-2">
              <Select
                value={String(pageSize)}
                onChange={(value) => {
                  // 每页条数变了，原来的第 2 页不一定还存在
                  setPageSize(Number(value));
                  onViewChange({ ...view, page: 1 });
                }}
                aria-label="每页条数"
                // 96 装不下最长的「500 条/页」（含箭头与左右内边距约 110px），会截成「500 条/」
                style={{ width: 112 }}
                virtual={false}
                options={FILE_PAGE_SIZE_OPTIONS.map((size) => ({
                  value: String(size),
                  label: `${size} 条/页`,
                }))}
              />
              <Button
                htmlType="button"
                variant="outlined"

                disabled={page <= 1}
                onClick={() =>
                  onViewChange({ ...view, page: Math.max(1, page - 1) })
                }
              >
                上一页
              </Button>
              <Button
                htmlType="button"
                variant="outlined"

                disabled={page >= totalPages}
                onClick={() => onViewChange({ ...view, page: page + 1 })}
              >
                下一页
              </Button>
            </span>
          </div>
        ) : null}

        {detailFile ? (
          <FileDetailDialog
            kbId={kbId}
            file={detailFile}
            defaultView={getDefaultDetailView(detailFile)}
            renderSource={(file) => <FilePreviewPane kbId={kbId} file={file} />}
            onOpenChange={(open) => {
              if (!open) setDetailFile(null);
            }}
          />
        ) : null}

        {uploadOpen ? (
          <FileUploadDialog
            kbId={kbId}
            parentId={parentId}
            parentLabel={
              crumbs.length > 0 ? crumbs[crumbs.length - 1].filename : '根目录'
            }
            onOpenChange={setUploadOpen}
            onUploaded={() => setUploadedAt(Date.now())}
          />
        ) : null}

        {moveTarget ? (
          <MoveFileDialog
            kbId={kbId}
            file={moveTarget}
            onOpenChange={(open) => {
              if (!open) setMoveTarget(null);
            }}
            onMoved={() => notifyDone('移动成功。')}
            onError={notifyError}
          />
        ) : null}
      </div>

      {folderDialog ? (
        <FolderNameDialog
          open
          mode={folderDialog.mode}
          initialName={
            folderDialog.mode === 'rename' ? folderDialog.file.filename : ''
          }
          submitting={folderBusy}
          onOpenChange={(open) => {
            if (!open) setFolderDialog(null);
          }}
          onSubmit={(folderName) => {
            const submitted =
              folderDialog.mode === 'create'
                ? createFolder(folderName, folderDialog.parentId)
                : renameFolder(folderDialog.file, folderName);
            void submitted.then((done) => {
              if (done) setFolderDialog(null);
            });
          }}
        />
      ) : null}

      {virtualFolderOpen ? (
        <VirtualFolderDialog
          kbId={kbId}
          open
          onOpenChange={setVirtualFolderOpen}
          notify={notify}
          onFinished={() => {
            void queryClient.invalidateQueries({
              queryKey: knowledgeKeys.virtualFolders(kbId),
            });
            void queryClient.invalidateQueries({
              queryKey: knowledgeKeys.detail(kbId),
            });
          }}
        />
      ) : null}
    </div>
  );
};
