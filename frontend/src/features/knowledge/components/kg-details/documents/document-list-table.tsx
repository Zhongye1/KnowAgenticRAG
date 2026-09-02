import { DownloadSimple } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { Table } from '@/components/ui/table'
import type { BaseEntity } from '@/types/api'
import { cn } from '@/lib/utils'

import type { DocumentItem } from '../../../api/types'
import { DocumentFileIcon } from '../../../utils/file-icon'
import {
  documentStatusMeta,
  isDocumentProcessing,
} from '../../../utils/document-policy'
import { formatDate, getSourceTypeLabel } from '../../../utils/file-utils'
import { DocumentActions } from '../document-actions'

export type DocumentRow = DocumentItem & BaseEntity

type DocumentListTableProps = {
  rows: DocumentRow[]
  selectedIds: ReadonlySet<string>
  onToggleSelect: (documentId: string) => void
  onTogglePage: (documentIds: string[]) => void
  onOpenDetail: (doc: DocumentItem) => void
  onDownload: (documentId: string) => void
  kbName: string
  isDeleting?: boolean
}

const CHECKBOX_CLASS =
  'size-4 cursor-pointer accent-primary-6 disabled:cursor-not-allowed disabled:opacity-50'

export function DocumentListTable({
  rows,
  selectedIds,
  onToggleSelect,
  onTogglePage,
  onOpenDetail,
  onDownload,
  kbName,
  isDeleting = false,
}: DocumentListTableProps) {
  const pageAllSelected =
    rows.length > 0 && rows.every((row) => selectedIds.has(row.document_id))
  const processingIds = new Set(
    rows
      .filter((row) => isDocumentProcessing(row.status))
      .map((row) => row.document_id),
  )

  return (
    <Table
      data={rows}
      columns={[
        {
          title: (
            <input
              type="checkbox"
              aria-label="全选本页"
              className={CHECKBOX_CLASS}
              checked={pageAllSelected}
              disabled={rows.length === 0}
              onChange={(event) => {
                if (event.target.checked) {
                  onTogglePage(rows.map((row) => row.document_id))
                } else {
                  onTogglePage([])
                }
              }}
            />
          ),
          field: 'document_id',
          Cell({ entry }) {
            return (
              <input
                type="checkbox"
                aria-label={`选择文档 ${entry.name}`}
                className={CHECKBOX_CLASS}
                checked={selectedIds.has(entry.document_id)}
                disabled={isDeleting || isDocumentProcessing(entry.status)}
                onChange={() => onToggleSelect(entry.document_id)}
              />
            )
          },
        },
        {
          title: '文档名称',
          field: 'name',
          Cell({ entry }) {
            return (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-w-0 max-w-full justify-start px-1 text-left font-normal"
                title="查看详情"
                onClick={() => onOpenDetail(entry)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <DocumentFileIcon
                    filename={entry.name}
                    sourceType={entry.source_type}
                  />
                  <span className="truncate">{entry.name}</span>
                </span>
              </Button>
            )
          },
        },
        {
          title: '类型',
          field: 'source_type',
          Cell({ entry }) {
            return (
              <span className="font-mono text-xs text-muted-foreground">
                {getSourceTypeLabel(entry.source_type)}
              </span>
            )
          },
        },
        {
          title: '状态',
          field: 'status',
          Cell({ entry }) {
            const meta = documentStatusMeta(entry.status)
            return (
              <span
                title={meta.description}
                className={cn(
                  'inline-flex rounded-medium px-1.5 py-0.5 text-xs',
                  meta.className,
                )}
              >
                {meta.label}
              </span>
            )
          },
        },
        {
          title: '文本块',
          field: 'chunk_count',
          Cell({ entry }) {
            return (
              <span className="tabular-nums text-muted-foreground">
                {entry.chunk_count}
              </span>
            )
          },
        },
        {
          title: '创建时间',
          field: 'created_time',
          Cell({ entry }) {
            return (
              <span className="text-muted-foreground">
                {formatDate(entry.created_time)}
              </span>
            )
          },
        },
        {
          title: '操作',
          field: 'document_id',
          Cell({ entry }) {
            return (
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  title="下载"
                  aria-label={`下载 ${entry.name}`}
                  onClick={() => onDownload(entry.document_id)}
                >
                  <DownloadSimple className="size-4" />
                </Button>
                <DocumentActions
                  kbName={kbName}
                  doc={entry}
                  disabled={isDeleting || processingIds.has(entry.document_id)}
                />
              </div>
            )
          },
        },
      ]}
    />
  )
}
