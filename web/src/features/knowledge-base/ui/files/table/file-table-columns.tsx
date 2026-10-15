/**
 * 文件表的列定义。
 *
 * 七列（选择 / 文件名 / 内容量 / 创建人 / 状态 / 时间 / 操作）的单元格渲染、排序函数与
 * 空值口径都在这里。它是一个纯函数而不是组件：调用方在自己的 `useMemo` 里调它，
 * 依赖收集留在持有数据的那个组件，本文件只吃参数、只出列。
 *
 * 进来的全是「事实」与「回调」：`readOnly` / `locked` / `stale` 是门禁，`operations` 是
 * 行内要执行的七个动作，`selection` 是当前的勾选。列定义因此不依赖任何查询或组件状态。
 */
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table';
import { Checkbox, Tag } from 'antd';

import type { KnowledgeFileItem } from '../../../api/knowledge-api';
import { resolveFileIconUrl } from '@/shared/lib/files';
import {
  canOpenFileDetail,
  canSelectFile,
  formatContentCount,
  formatFileTableTime,
  getFilePrimaryAction,
  getFileStatusSortWeight,
  getFileStatusView,
} from '../../../lib/knowledge-files';
import { FileRowActions } from './file-row-actions';

/**
 * v9 把可选能力做成「特性槽」：不注册 `rowSortingFeature` 就没有排序状态与方法，
 * 核心行模型则是自动的（v8 的 `getCoreRowModel()` 在 v9 已移除）。
 */
export const tableFeatureSet = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const fileColumn = createColumnHelper<
  typeof tableFeatureSet,
  KnowledgeFileItem
>();

/** 行内操作：列只负责把行交给它们，成功/失败文案由编排层决定。 */
export type FileRowOperations = {
  download: (file: KnowledgeFileItem) => void;
  parse: (file: KnowledgeFileItem) => void;
  index: (file: KnowledgeFileItem) => void;
  move: (file: KnowledgeFileItem) => void;
  delete: (file: KnowledgeFileItem) => void;
  renameFolder: (file: KnowledgeFileItem) => void;
  createSubfolder: (file: KnowledgeFileItem) => void;
};

/** 选择列要用的勾选状态；状态本身由表格持有。 */
export type FileTableSelection = {
  selectedIds: string[];
  /** 当前页可勾选的行：表头全选以它为准（全选 = 当前页）。 */
  selectableOnPage: KnowledgeFileItem[];
  allSelected: boolean;
  someSelected: boolean;
  setSelectedIds: (ids: string[]) => void;
};

export type FileColumnsOptions = {
  /** 只读知识库：不渲染选择列，写入口只剩下载与浏览。 */
  readOnly: boolean;
  /** 有操作在飞行中。 */
  locked: boolean;
  /** 表里还是上一个目录的行（`keepPreviousData` 期间）。 */
  stale: boolean;
  enterFolder: (file: KnowledgeFileItem) => void;
  openDetail: (file: KnowledgeFileItem) => void;
  operations: FileRowOperations;
  selection: FileTableSelection;
};

export const fileColumns = ({
  readOnly,
  locked,
  stale,
  enterFolder,
  openDetail,
  operations,
  selection,
}: FileColumnsOptions) =>
  fileColumn.columns([
    // 只读知识库没有批量入口，选择列也不渲染
    ...(readOnly
      ? []
      : [
          fileColumn.display({
            id: 'select',
            header: () => (
              <Checkbox
                aria-label="选择当前页全部文件"
                checked={selection.allSelected}
                indeterminate={selection.someSelected && !selection.allSelected}
                disabled={selection.selectableOnPage.length === 0}
                onChange={(e) =>
                  selection.setSelectedIds(
                    e.target.checked
                      ? selection.selectableOnPage.map((item) => item.file_id)
                      : [],
                  )
                }
              />
            ),
            cell: ({ row }) => (
              <Checkbox
                aria-label={`选择 ${row.original.filename}`}
                checked={selection.selectedIds.includes(row.original.file_id)}
                disabled={!canSelectFile(row.original, locked)}
                onChange={(e) =>
                  selection.setSelectedIds(
                    e.target.checked
                      ? [...selection.selectedIds, row.original.file_id]
                      : selection.selectedIds.filter(
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
      // 首次点击按升序：文件夹在前
      sortDescFirst: false,
      sortFn: (left, right) => {
        const a = left.original;
        const b = right.original;
        // 文件夹优先，其余按名称本地化比较
        if (a.is_folder && !b.is_folder) return -1;
        if (!a.is_folder && b.is_folder) return 1;
        return (a.filename || '').localeCompare(b.filename || '');
      },
      cell: ({ row }) =>
        row.original.is_folder ? (
          <button
            type="button"
            // 原生 button 的默认灰底 / 边框 / 内边距都要清掉，否则行里会出现一块方灰底
            className="flex min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-left hover:text-primary-6 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={stale}
            onClick={() => enterFolder(row.original)}
          >
            <img
              src={resolveFileIconUrl(row.original.filename, { isDir: true })}
              alt=""
              aria-hidden
              className="size-4 shrink-0"
            />
            <span className="truncate" title={row.original.filename}>
              {row.original.filename}
            </span>
          </button>
        ) : canOpenFileDetail(row.original) ? (
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-left hover:text-primary-6 hover:underline"
            title={row.original.filename}
            onClick={() => openDetail(row.original)}
          >
            <img
              src={resolveFileIconUrl(row.original.filename)}
              alt=""
              aria-hidden
              className="size-4 shrink-0"
            />
            <span className="line-clamp-1">{row.original.filename}</span>
          </button>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <img
              src={resolveFileIconUrl(row.original.filename)}
              alt=""
              aria-hidden
              className="size-4 shrink-0"
            />
            <span className="truncate" title={row.original.filename}>
              {row.original.filename}
            </span>
          </span>
        ),
    }),
    fileColumn.accessor('token_count', {
      header: '内容量',
      // 内容量对文件夹没有意义，显示 `-`；首次点击按升序
      sortDescFirst: false,
      // v9 不注册比较函数会在点表头时告警
      sortFn: (left, right) =>
        (left.original.token_count ?? 0) - (right.original.token_count ?? 0),
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
      // 目录没有解析/入库状态，对文件夹不渲染任何内容
      cell: ({ row }) => {
        if (row.original.is_folder) return null;
        const view = getFileStatusView(row.original.status);
        const primary = getFilePrimaryAction(row.original);
        // antd `Tag` 自带右外边距，单元格里不需要
        const tag = (
          <Tag color={view.color} className="m-0">
            {view.label}
          </Tag>
        );
        // 状态 pill 可点：点了直接走这一行的主操作（解析或入库），不必先开行内菜单。
        // 只读、有操作在飞行中、或表里还是上一个目录的行不给点。
        if (!primary || readOnly || locked || stale) return tag;
        // 可点的是按钮而不是 `Tag` 自己：`Tag` 渲染成 span，直接挂 onClick 就丢了键盘可达与 role
        return (
          <button
            type="button"
            className="border-0 bg-transparent p-0"
            aria-label={`${view.label}，点击${primary.label}：${row.original.filename}`}
            onClick={() =>
              (primary.type === 'parse' ? operations.parse : operations.index)(
                row.original,
              )
            }
          >
            {tag}
          </button>
        );
      },
    }),
    // 列序是 文件名 / 内容量 / 创建人 / 状态 / 时间 / 操作：时间在操作之前
    fileColumn.accessor('created_at', {
      header: '时间',
      sortFn: (left, right) =>
        new Date(right.original.created_at ?? 0).getTime() -
        new Date(left.original.created_at ?? 0).getTime(),
      cell: ({ row }) =>
        // 只对虚拟目录留空：实体目录有创建时间
        row.original.is_virtual_folder
          ? '-'
          : formatFileTableTime(row.original.created_at),
    }),
    fileColumn.display({
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <FileRowActions
          file={row.original}
          readOnly={readOnly}
          // keepPreviousData 期间表里还是上一个目录的行，不能对它们动手
          locked={locked || stale}
          onDownload={operations.download}
          onParse={operations.parse}
          onIndex={operations.index}
          onMove={operations.move}
          onDelete={operations.delete}
          onRenameFolder={operations.renameFolder}
          onCreateSubfolder={operations.createSubfolder}
        />
      ),
    }),
  ]);
