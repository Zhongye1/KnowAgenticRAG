/**
 * 个人空间文件表。
 *
 * 对齐参照 `WorkspaceFileList.vue` + `FileBrowserTable.vue`：表头是一条 44px 的工具条
 * （左侧面包屑、右侧条目计数与「多选 / 删除选中」），下面是四列表格，行内操作收在
 * 「更多操作」菜单里（下载只在文件行出现，删除在可写行出现）。单击行即进入目录或预览。
 *
 * 本仓没有 antd Table（结构走 `shared/ui/table` 的原语），表格外观按参照的
 * `.file-browser-ant-table` 逐值搬进 CSS Module。
 */
import * as React from 'react';
import { Download, ListChecks, MoreHorizontal, Trash2 } from 'lucide-react';

import {
  Button,
  Checkbox,
  Dropdown,
  Spin,
  Tooltip,
  type MenuProps,
} from 'antd';

import type { WorkspaceRow } from '../lib/workspace-view';
import { resolveFileIconUrl } from '@/shared/lib/file-icon';
import {
  TableBody,
  TableCell,
  TableElement,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

import styles from './workspace-file-table.module.css';

type WorkspaceFileTableProps = {
  rows: WorkspaceRow[];
  breadcrumbs: Array<{ name: string; path: string }>;
  /** 当前目录，用于判断面包屑最后一段（不可点）。 */
  currentPath: string;
  isLoading: boolean;
  selectionMode: boolean;
  selectedPaths: string[];
  deletingPaths: string[];
  onOpen: (row: WorkspaceRow) => void;
  onBreadcrumb: (path: string) => void;
  onToggleSelectionMode: () => void;
  onToggleSelection: (path: string) => void;
  onDeleteSelected: () => void;
  onDownload: (row: WorkspaceRow) => void;
  onDelete: (row: WorkspaceRow) => void;
};

export const WorkspaceFileTable = ({
  rows,
  breadcrumbs,
  currentPath,
  isLoading,
  selectionMode,
  selectedPaths,
  deletingPaths,
  onOpen,
  onBreadcrumb,
  onToggleSelectionMode,
  onToggleSelection,
  onDeleteSelected,
  onDownload,
  onDelete,
}: WorkspaceFileTableProps) => {
  const isLastCrumb = (path: string, index: number) =>
    index === breadcrumbs.length - 1 ||
    path.replace(/\/+$/, '') === currentPath.replace(/\/+$/, '');

  const rowMenu = (row: WorkspaceRow): MenuProps['items'] => [
    ...(row.canDownload
      ? [
          {
            key: 'download',
            label: (
              <span className={styles.menuItem}>
                <Download size={14} aria-hidden />
                <span>下载</span>
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'delete',
      danger: true,
      label: (
        <span className={styles.menuItem}>
          <Trash2 size={14} aria-hidden />
          <span>删除</span>
        </span>
      ),
    },
  ];

  return (
    <section className={styles.shell}>
      <div className={styles.header}>
        <nav className={styles.breadcrumbs} aria-label="文件路径">
          {breadcrumbs.map((crumb, index) => (
            <button
              key={crumb.path}
              type="button"
              className={`${styles.crumb} ${
                isLastCrumb(crumb.path, index) ? styles.crumbActive : ''
              }`}
              title={crumb.path}
              disabled={isLastCrumb(crumb.path, index)}
              onClick={() => onBreadcrumb(crumb.path)}
            >
              <span className={styles.crumbLabel}>{crumb.name}</span>
            </button>
          ))}
        </nav>

        <div className={styles.actions}>
          <span className={styles.entryCount}>{rows.length} 项</span>
          <Tooltip title="多选">
            <Button
              size="small"
              type={selectionMode ? 'primary' : 'default'}
              aria-label="多选"
              icon={<ListChecks size={14} aria-hidden />}
              onClick={onToggleSelectionMode}
            />
          </Tooltip>
          {selectionMode ? (
            <Button
              size="small"
              danger
              disabled={!selectedPaths.length}
              loading={deletingPaths.length > 0}
              onClick={onDeleteSelected}
            >
              删除选中
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : rows.length ? (
        <div className={styles.tableWrap}>
          <TableElement className={styles.table}>
            <TableHeader>
              <TableRow className={styles.headRow}>
                {selectionMode ? (
                  <TableHead className={styles.checkCell} />
                ) : null}
                <TableHead>名称</TableHead>
                <TableHead className={styles.sizeCell}>大小</TableHead>
                <TableHead className={styles.timeCell}>修改时间</TableHead>
                <TableHead className={styles.actionCell}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.key}
                  className={`${styles.row} ${
                    deletingPaths.includes(row.key) ? styles.rowDeleting : ''
                  }`}
                  aria-selected={
                    selectionMode ? selectedPaths.includes(row.key) : undefined
                  }
                  onClick={() => onOpen(row)}
                >
                  {selectionMode ? (
                    <TableCell
                      className={styles.checkCell}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        aria-label={`选择 ${row.name}`}
                        checked={selectedPaths.includes(row.key)}
                        onChange={() => onToggleSelection(row.key)}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <span className={styles.nameCell}>
                      <img
                        src={resolveFileIconUrl(row.entry.path, {
                          isDir: row.isDir,
                        })}
                        alt=""
                        className={styles.nameIcon}
                      />
                      <span className={styles.nameText} title={row.name}>
                        {row.name}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>{row.sizeLabel}</TableCell>
                  <TableCell>{row.modifiedLabel}</TableCell>
                  <TableCell
                    className={styles.actionCell}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: rowMenu(row),
                        onClick: ({ key }) => {
                          if (key === 'download') onDownload(row);
                          if (key === 'delete') onDelete(row);
                        },
                      }}
                    >
                      <button
                        type="button"
                        className={styles.moreAction}
                        disabled={deletingPaths.includes(row.key)}
                        aria-label={`${row.name} 更多操作`}
                      >
                        <MoreHorizontal size={16} aria-hidden />
                      </button>
                    </Dropdown>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableElement>
        </div>
      ) : (
        <div className={styles.center}>当前文件夹为空</div>
      )}
    </section>
  );
};
