/**
 * 知识库文件表。
 *
 * 移植上游 `FileTable.vue` + 共用的 `FileBrowserTable.vue` 壳：面包屑与目录进入、
 * 状态筛选、按列的客户端排序（上游就是对当前页排序）、服务端分页（100/300/500）、
 * 刷新与空态，行内操作（下载 / 解析或入库 / 重新入库 / 移动 / 删除）与批量操作
 * （批量解析 / 入库 / 删除）。上传与文件详情随后续分片落地。
 */
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ChevronRight,
  Home,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';

import { knowledgeApi, type KnowledgeFileItem } from '../api/knowledge-api';
import { getDefaultDetailView } from '../lib/knowledge-files';
import { triggerBlobDownload } from '../lib/file-download';
import {
  canDeleteFile,
  canIndexFile,
  canOpenFileDetail,
  canParseFile,
  canSelectFile,
  isProcessingFile,
  FILE_PAGE_SIZE_OPTIONS,
  FILE_STATUS_FILTER_OPTIONS,
  formatContentCount,
  formatFileTableTime,
  getFileStatusSortWeight,
  getFileStatusView,
} from '../lib/knowledge-files';
import type { FileCrumb } from '../model/file-view';
import { openLocation, type FileView } from '../model/file-view';
import {
  knowledgeKeys,
  useDeleteKnowledgeFile,
  useDeleteKnowledgeFiles,
  useIndexKnowledgeFiles,
  useKnowledgeFiles,
  useParseKnowledgeFiles,
} from '../model/knowledge-queries';
import { FileDetailDialog } from './file-detail-dialog';
import { FileUploadDialog } from './file-upload-dialog';
import { FilePreview as FilePreviewPane } from './file-preview';
import { FileRowActions } from './file-row-actions';
import { MoveFileDialog } from './move-file-dialog';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { confirm } from '@/shared/ui/confirm-dialog';
import { Empty } from '@/shared/ui/empty';
import { useNotifications } from '@/shared/ui/notifications';
import { Spinner } from '@/shared/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import {
  TableBody,
  TableCell,
  // 注意：`Table` 是本仓的简易表格组件（{data, columns} 形态），
  // 这里要用 shadcn 的原语 `TableElement`
  TableElement,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

/**
 * v9 把可选能力做成「特性槽」：不注册 `rowSortingFeature` 就没有排序状态与方法，
 * 核心行模型则是自动的（v8 的 `getCoreRowModel()` 在 v9 已移除）。
 */
const tableFeatureSet = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const fileColumn = createColumnHelper<
  typeof tableFeatureSet,
  KnowledgeFileItem
>();

/** 有文件在处理中时的轮询间隔（上游 10 秒起，本仓不做退避）。 */
const PROCESSING_POLL_MS = 10_000;

/**
 * 刚提交完上传后的轮询窗口。
 *
 * 三阶段 ingest 是后台任务，`POST /documents` 返回 `queued` 时文件记录还没建出来，
 * 立刻重取看不到新文件；上游同样用「延迟刷新 + 自动刷新」兜这段空窗。
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

/** 批量删除的分批大小：与上游一致，避免一次请求里塞进整页文件。 */
const BATCH_DELETE_CHUNK_SIZE = 50;

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
   * 选择连同它所属的视图键一起存，读到不匹配的键就当作空选择（上游这里会留下幽灵选择）。
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

  const notifications = useNotifications();
  const removeOne = useDeleteKnowledgeFile(kbId);
  const removeMany = useDeleteKnowledgeFiles(kbId);
  const parseFiles = useParseKnowledgeFiles(kbId);
  const indexFiles = useIndexKnowledgeFiles(kbId);
  // 有操作在飞行中时，行内入口先关掉（上游 store.state.lock）
  const locked =
    removeOne.isPending ||
    removeMany.isPending ||
    parseFiles.isPending ||
    indexFiles.isPending;

  const notifyError = React.useCallback(
    (message: string) =>
      notifications.addNotification({ type: 'error', title: '文件', message }),
    [notifications],
  );
  const notifyDone = React.useCallback(
    (message: string) =>
      notifications.addNotification({
        type: 'success',
        title: '文件',
        message,
      }),
    [notifications],
  );

  /** 下载原始文件：文件名优先用响应头里的，取不到退回行上的展示名。 */
  const onDownload = React.useCallback(
    async (file: KnowledgeFileItem) => {
      try {
        const { blob, filename } = await knowledgeApi.downloadDocument(
          kbId,
          file.file_id,
        );
        triggerBlobDownload(blob, filename ?? file.filename);
      } catch (error) {
        notifyError(error instanceof Error ? error.message : '下载失败。');
      }
    },
    [kbId, notifyError],
  );

  /** 提交解析或入库；后端受理的是任务，列表状态稍后才变。 */
  const submitTask = React.useCallback(
    async (kind: 'parse' | 'index', file: KnowledgeFileItem) => {
      try {
        if (kind === 'parse') {
          await parseFiles.mutateAsync([file.file_id]);
        } else {
          await indexFiles.mutateAsync([file.file_id]);
        }
        notifyDone(kind === 'parse' ? '已提交解析。' : '已提交入库。');
      } catch (error) {
        notifyError(
          error instanceof Error
            ? error.message
            : kind === 'parse'
              ? '提交解析失败。'
              : '提交入库失败。',
        );
      }
    },
    [indexFiles, notifyDone, notifyError, parseFiles],
  );

  const onDelete = React.useCallback(
    async (file: KnowledgeFileItem) => {
      const confirmed = await confirm(
        file.is_folder
          ? {
              title: '删除文件夹',
              description: `确定要删除文件夹「${file.filename}」及其包含的所有内容吗？`,
              confirmText: '确认',
              destructive: true,
            }
          : {
              title: '删除文件',
              description: '确定要删除该文件吗？',
              confirmText: '确认',
              destructive: true,
            },
      );
      if (!confirmed) return;
      try {
        await removeOne.mutateAsync(file.file_id);
        notifyDone('删除成功。');
      } catch (error) {
        notifyError(error instanceof Error ? error.message : '删除文件失败。');
      }
    },
    [notifyDone, notifyError, removeOne],
  );

  /**
   * 刷新：重取当前页，并让详情失效——统计卡里的待解析/待入库数量随解析与入库变化，
   * 上游的刷新同样会带上详情。
   */
  const handleRefresh = () => {
    void files.refetch();
    void queryClient.invalidateQueries({
      queryKey: knowledgeKeys.detail(kbId),
    });
  };

  /** 当前页可勾选的行：批量条与表头全选都以它为准（上游也是「全选 = 当前页」）。 */
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

  /** 批量解析/入库：只提交可解析（可入库）的行，其余跳过。 */
  const submitBatchTask = async (kind: 'parse' | 'index') => {
    const predicate = kind === 'parse' ? canParseFile : canIndexFile;
    const valid = items.filter(
      (item) => selectedIds.includes(item.file_id) && predicate(item),
    );
    if (valid.length === 0) {
      notifications.addNotification({
        type: 'warning',
        title: '文件',
        message: kind === 'parse' ? '没有可解析的文件。' : '没有可入库的文件。',
      });
      return;
    }
    try {
      const ids = valid.map((item) => item.file_id);
      if (kind === 'parse') {
        await parseFiles.mutateAsync(ids);
      } else {
        await indexFiles.mutateAsync(ids);
      }
      notifyDone(
        kind === 'parse'
          ? `已提交 ${ids.length} 个文件解析。`
          : `已提交 ${ids.length} 个文件入库。`,
      );
      setSelectedIds([]);
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : kind === 'parse'
            ? '提交解析失败。'
            : '提交入库失败。',
      );
    }
  };

  /**
   * 批量删除：按上游语义先确认数量，只提交可删除的行（解析/入库进行中的会被跳过），
   * 再按 50 个一批提交，单批失败不中断其余批次。
   */
  const onBatchDelete = async () => {
    const valid = items.filter(
      (item) =>
        selectedIds.includes(item.file_id) && canDeleteFile(item, locked),
    );
    if (valid.length === 0) {
      notifications.addNotification({
        type: 'warning',
        title: '文件',
        message: '没有可删除的文件。',
      });
      return;
    }
    // 只报当前页能看到的选中行，避免拿已被后台刷新掉的 id 撑大数字
    const selectedOnPage = items.filter((item) =>
      selectedIds.includes(item.file_id),
    );
    const skipped = selectedOnPage.length - valid.length;
    const confirmed = await confirm({
      title: '批量删除文件',
      description: `确定要删除选中的 ${valid.length} 个文件吗？${
        skipped > 0 ? `另有 ${skipped} 个处理中的文件会被跳过。` : ''
      }`,
      confirmText: '确认',
      destructive: true,
    });
    if (!confirmed) return;

    const ids = valid.map((item) => item.file_id);
    let deleted = 0;
    let failed = 0;
    for (let index = 0; index < ids.length; index += BATCH_DELETE_CHUNK_SIZE) {
      const chunk = ids.slice(index, index + BATCH_DELETE_CHUNK_SIZE);
      try {
        const result = await removeMany.mutateAsync(chunk);
        deleted += result.deleted_count ?? 0;
        failed += result.failed_items?.length ?? 0;
      } catch {
        failed += chunk.length;
      }
    }
    setSelectedIds([]);
    if (failed === 0) {
      notifyDone(`成功删除 ${deleted} 个文件。`);
      return;
    }
    if (deleted > 0) {
      notifications.addNotification({
        type: 'warning',
        title: '文件',
        message: `成功删除 ${deleted} 个文件，${failed} 个文件删除失败。`,
      });
      return;
    }
    notifyError(`${failed} 个文件删除失败。`);
  };

  const columns = React.useMemo(
    () =>
      fileColumn.columns([
        // 只读知识库没有批量入口，选择列也不渲染（上游 tableSelection 在只读时为 null）
        ...(readOnly
          ? []
          : [
              fileColumn.display({
                id: 'select',
                header: () => (
                  <Checkbox
                    aria-label="选择当前页全部文件"
                    checked={
                      allSelected
                        ? true
                        : someSelected
                          ? 'indeterminate'
                          : false
                    }
                    disabled={selectableOnPage.length === 0}
                    onCheckedChange={(checked) =>
                      setSelectedIds(
                        checked
                          ? selectableOnPage.map((item) => item.file_id)
                          : [],
                      )
                    }
                  />
                ),
                cell: ({ row }) => (
                  <Checkbox
                    aria-label={`选择 ${row.original.filename}`}
                    checked={selectedIds.includes(row.original.file_id)}
                    disabled={!canSelectFile(row.original, locked)}
                    onCheckedChange={(checked) =>
                      setSelectedIds(
                        checked
                          ? [...selectedIds, row.original.file_id]
                          : selectedIds.filter(
                              (id) => id !== row.original.file_id,
                            ),
                      )
                    }
                  />
                ),
              }),
            ]),
        fileColumn.accessor('filename', {
          header: '文件名',
          // 上游 sortDirections 是先升序：首次点击文件夹在前
          sortDescFirst: false,
          sortFn: (left, right) => {
            const a = left.original;
            const b = right.original;
            // 文件夹优先，其余按名称本地化比较（与上游同）
            if (a.is_folder && !b.is_folder) return -1;
            if (!a.is_folder && b.is_folder) return 1;
            return (a.filename || '').localeCompare(b.filename || '');
          },
          cell: ({ row }) =>
            row.original.is_folder ? (
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 text-left hover:text-primary-6 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={showingStaleRows}
                onClick={() => enterFolder(row.original)}
              >
                <ChevronRight className="size-3 shrink-0" aria-hidden />
                <span className="truncate" title={row.original.filename}>
                  {row.original.filename}
                </span>
              </button>
            ) : canOpenFileDetail(row.original) ? (
              <button
                type="button"
                className="min-w-0 text-left hover:text-primary-6 hover:underline"
                title={row.original.filename}
                onClick={() => setDetailFile(row.original)}
              >
                <span className="line-clamp-1">{row.original.filename}</span>
              </button>
            ) : (
              <span className="truncate" title={row.original.filename}>
                {row.original.filename}
              </span>
            ),
        }),
        fileColumn.accessor('token_count', {
          header: '内容量',
          // 内容量对文件夹没有意义（上游同显示 `-`），首次点击按升序（上游 sortDirections 同）
          sortDescFirst: false,
          // v9 不注册比较函数会在点表头时告警；与上游同为数值比较
          sortFn: (left, right) =>
            (left.original.token_count ?? 0) -
            (right.original.token_count ?? 0),
          cell: ({ row }) =>
            row.original.is_folder ? (
              '-'
            ) : (
              <span
                title={`${formatContentCount(row.original.chunk_count)} Chunks`}
              >
                {formatContentCount(row.original.token_count)} Tokens
              </span>
            ),
        }),
        fileColumn.accessor('created_by_name', {
          header: '创建人',
          enableSorting: false,
          cell: ({ row }) =>
            row.original.is_virtual_folder || !row.original.created_by
              ? '-'
              : (row.original.created_by_name ?? row.original.created_by),
        }),
        fileColumn.accessor('status', {
          header: '状态',
          sortFn: (left, right) =>
            getFileStatusSortWeight(left.original.status) -
            getFileStatusSortWeight(right.original.status),
          // 目录没有解析/入库状态，上游对文件夹不渲染任何内容
          cell: ({ row }) => {
            if (row.original.is_folder) return null;
            const view = getFileStatusView(row.original.status);
            return (
              <span
                className={`inline-flex rounded-small px-2 py-0.5 text-xs ${view.className}`}
              >
                {view.label}
              </span>
            );
          },
        }),
        fileColumn.display({
          id: 'actions',
          header: '操作',
          cell: ({ row }) => (
            <FileRowActions
              file={row.original}
              readOnly={readOnly}
              // keepPreviousData 期间表里还是上一个目录的行，不能对它们动手
              locked={locked || showingStaleRows}
              onDownload={(file) => void onDownload(file)}
              onParse={(file) => void submitTask('parse', file)}
              onIndex={(file) => void submitTask('index', file)}
              onMove={(file) => setMoveTarget(file)}
              onDelete={(file) => void onDelete(file)}
            />
          ),
        }),
        fileColumn.accessor('created_at', {
          header: '时间',
          sortFn: (left, right) =>
            new Date(right.original.created_at ?? 0).getTime() -
            new Date(left.original.created_at ?? 0).getTime(),
          cell: ({ row }) =>
            // 上游只对虚拟目录留空：实体目录有创建时间
            row.original.is_virtual_folder
              ? '-'
              : formatFileTableTime(row.original.created_at),
        }),
      ]),
    // 行内操作的处理器每次渲染都是新的闭包，列定义跟着它们重建
    [
      enterFolder,
      showingStaleRows,
      readOnly,
      locked,
      onDelete,
      onDownload,
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
    <div className="flex flex-col gap-3">
      {!readOnly && selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-large border border-color-border-1 bg-color-bg-1 px-3 py-2">
          <span className="text-xs text-color-text-2">
            已选 {selectedIds.length} 项
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={
              locked ||
              !items.some(
                (item) =>
                  selectedIds.includes(item.file_id) && canParseFile(item),
              )
            }
            onClick={() => void submitBatchTask('parse')}
          >
            批量解析
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={
              locked ||
              !items.some(
                (item) =>
                  selectedIds.includes(item.file_id) && canIndexFile(item),
              )
            }
            onClick={() => void submitBatchTask('index')}
          >
            批量入库
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-danger-6"
            disabled={
              locked ||
              !items.some(
                (item) =>
                  selectedIds.includes(item.file_id) && canDeleteFile(item),
              )
            }
            onClick={() => void onBatchDelete()}
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
              type="button"
              variant="ghost"
              size="sm"
              aria-label="回到根目录"
              onClick={() => gotoCrumb(-1)}
            >
              <Home className="size-3" aria-hidden />
              根目录
            </Button>
            {crumbs.map((crumb, index) => (
              <React.Fragment key={`${crumb.fileId ?? 'root'}-${index}`}>
                <ChevronRight className="size-3 shrink-0" aria-hidden />
                <button
                  type="button"
                  className="max-w-40 truncate hover:text-color-text-1"
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
            onValueChange={(value) => {
              // 换筛选就是换一份结果集，页码必须归位
              onViewChange({ ...view, status: value, page: 1 });
            }}
          >
            <SelectTrigger aria-label="按状态筛选文件" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {FILE_STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {onOpenSearch ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenSearch}
            >
              <Search className="size-4" aria-hidden />
              搜索文件
            </Button>
          ) : null}

          {readOnly ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={showingStaleRows}
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="size-4" aria-hidden />
              上传文件
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
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
          <Spinner aria-hidden className="size-4" />
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
            type="button"
            variant="outline"
            onClick={() => void files.refetch()}
          >
            重试
          </Button>
        </div>
      ) : null}

      {!showingStaleRows && files.isSuccess && items.length === 0 ? (
        <Empty description="暂无文件" />
      ) : null}

      {items.length > 0 ? (
        <div
          className={`rounded-large border border-color-border-1 ${
            showingStaleRows ? 'opacity-60' : ''
          }`}
          aria-busy={showingStaleRows || undefined}
        >
          <TableElement>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
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
                          className="flex items-center gap-1"
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
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-testid="file-row">
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </TableElement>
        </div>
      ) : null}

      {total > 0 ? (
        <div className="flex items-center justify-between gap-2 text-xs text-color-text-3">
          <span>
            共 {total} 条，第 {page} / {totalPages} 页
          </span>
          <span className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                // 每页条数变了，原来的第 2 页不一定还存在
                setPageSize(Number(value));
                onViewChange({ ...view, page: 1 });
              }}
            >
              <SelectTrigger aria-label="每页条数" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} 条/页
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                onViewChange({ ...view, page: Math.max(1, page - 1) })
              }
            >
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
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
  );
};
