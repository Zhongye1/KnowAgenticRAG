import { Download, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useNotifications } from '@/components/ui/notifications'
import { cn } from '@/lib/utils'

import {
  getDocumentDownloadUrl,
  useDeleteDocument,
  useReplaceDocumentFile,
} from '../../../api/documents'
import type { DocumentItem } from '../../../api/types'
import { useDocumentPreviewWindow } from '../../../hooks/use-document-preview-window'
import { DocumentPreview } from '../../preview/document-preview'
import { DegradedNotice } from '../../preview/preview-frame'
import {
  canDeleteDocument,
  canReplaceDocument,
  documentStatusMeta,
} from '../../../utils/document-policy'
import { DocumentFileIcon } from '../../../utils/file-icon'
import { formatDate, getSourceTypeLabel } from '../../../utils/file-utils'

type DocumentDetailDrawerProps = {
  doc: DocumentItem | null
  kbName: string
  onOpenChange: (open: boolean) => void
}

const MetaRow = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="flex justify-between gap-3 py-1">
    <dt className="shrink-0 text-muted-foreground">{label}</dt>
    <dd className="min-w-0 truncate text-right font-mono text-[11px] text-foreground">
      {value || '-'}
    </dd>
  </div>
)

export function DocumentDetailDrawer({
  doc,
  kbName,
  onOpenChange,
}: DocumentDetailDrawerProps) {
  const { addNotification } = useNotifications()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const open = Boolean(doc)
  // 预览走服务端 Range 代理与异步转换链路（D55），不再取预签名 URL：
  // 预签名 URL 签发后即绕过 ACL，而预览需要在每次请求上校验资源权限。
  const preview = useDocumentPreviewWindow(doc?.document_id ?? '', open)

  const deleteMutation = useDeleteDocument({
    mutationConfig: {
      onSuccess: () => {
        addNotification({
          type: 'success',
          title: '文档已删除',
          message: doc?.name,
        })
        setDeleteOpen(false)
        onOpenChange(false)
      },
    },
  })

  const replaceMutation = useReplaceDocumentFile({
    mutationConfig: {
      onSuccess: () => {
        addNotification({
          type: 'success',
          title: '文件已替换',
          message: '新文件已上传，状态回到待处理',
        })
      },
    },
  })

  const handleReplace = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && doc) {
      replaceMutation.mutate({
        kbName,
        documentId: doc.document_id,
        file,
      })
    }
    event.target.value = ''
  }

  if (!doc) return null

  const statusMeta = documentStatusMeta(doc.status)

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="sm:max-w-md">
        <DrawerHeader className="gap-1 pr-8">
          <DrawerTitle className="flex items-center gap-2 text-sm">
            <DocumentFileIcon filename={doc.name} sourceType={doc.source_type} />
            <span className="min-w-0 truncate">{doc.name}</span>
          </DrawerTitle>
          <DrawerDescription>
            {getSourceTypeLabel(doc.source_type)}
            {doc.pipeline ? ` · 管道 ${doc.pipeline}` : ''} ·{' '}
            <span
              className={cn(
                'inline-flex rounded-medium px-1.5 py-0.5 text-[11px]',
                statusMeta.className,
              )}
            >
              {statusMeta.label}
            </span>
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {preview.isDegraded ? (
            <DegradedNotice reason={preview.preview?.fallback_reason} />
          ) : null}
          <DocumentPreview
            preview={preview.preview}
            onLoadMore={preview.loadMore}
            isFetchingMore={preview.isFetchingMore}
          />

          <dl className="divide-y divide-border/60 text-xs">
            <MetaRow label="文档 ID" value={doc.document_id} />
            <MetaRow label="知识库" value={doc.kb_name} />
            <MetaRow label="来源类型" value={doc.source_type} />
            <MetaRow label="管道" value={doc.pipeline} />
            <MetaRow label="SHA-256" value={doc.sha256} />
            <MetaRow label="文本块" value={String(doc.chunk_count)} />
            <MetaRow label="对象存储键" value={doc.source_uri} />
            <MetaRow label="创建时间" value={formatDate(doc.created_time)} />
            <MetaRow label="更新时间" value={formatDate(doc.updated_time)} />
          </dl>
        </div>

        <DrawerFooter className="flex-row items-center justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleReplace}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={
              replaceMutation.isPending || !canReplaceDocument(doc.status)
            }
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            替换文件
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void getDocumentDownloadUrl(doc.document_id).then(({ url }) =>
                window.open(url, '_blank', 'noopener,noreferrer'),
              )
            }}
          >
            <Download className="size-4" />
            下载
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!canDeleteDocument(doc.status)}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            删除
          </Button>
        </DrawerFooter>
      </DrawerContent>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除文档</DialogTitle>
            <DialogDescription>
              确定删除「{doc.name}」？将同时清理对象存储中的文件与关联登记。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                取消
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                deleteMutation.mutate({
                  kbName,
                  documentId: doc.document_id,
                })
              }}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Drawer>
  )
}
