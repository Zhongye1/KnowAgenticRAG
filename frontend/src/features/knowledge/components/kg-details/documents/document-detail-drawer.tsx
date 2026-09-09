import {
  DownloadSimple,
  FileText,
  TrashSimple,
  UploadSimple,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'

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
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import {
  getDocumentDownloadUrl,
  useDeleteDocument,
  useReplaceDocumentFile,
} from '../../../api/documents'
import type { DocumentItem } from '../../../api/types'
import {
  canDeleteDocument,
  canReplaceDocument,
  documentStatusMeta,
} from '../../../utils/document-policy'
import { DocumentFileIcon } from '../../../utils/file-icon'
import {
  formatDate,
  getFileExtension,
  getSourceTypeLabel,
} from '../../../utils/file-utils'

type DocumentDetailDrawerProps = {
  doc: DocumentItem | null
  kbName: string
  onOpenChange: (open: boolean) => void
}

type PreviewKind = 'image' | 'pdf' | 'html' | 'text' | 'none'

const previewKindOf = (name: string): PreviewKind => {
  const extension = getFileExtension(name)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) {
    return 'image'
  }
  if (extension === 'pdf') return 'pdf'
  if (['html', 'htm'].includes(extension)) return 'html'
  if (['txt', 'md', 'markdown', 'csv', 'json'].includes(extension)) {
    return 'text'
  }
  return 'none'
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const open = Boolean(doc)

  useEffect(() => {
    if (!doc) return
    setPreviewUrl(null)
    setPreviewLoading(true)
    let cancelled = false
    getDocumentDownloadUrl(doc.document_id)
      .then(({ url }) => {
        if (!cancelled) setPreviewUrl(url)
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [doc])

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
  const previewKind = previewKindOf(doc.name)
  const canPreview = previewKind !== 'none'

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
          {previewLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : previewUrl && canPreview ? (
            <div className="overflow-hidden rounded-large border border-border/70 bg-color-bg-1">
              {previewKind === 'image' ? (
                <img
                  src={previewUrl}
                  alt={doc.name}
                  className="max-h-72 w-full object-contain"
                />
              ) : (
                <iframe
                  src={previewUrl}
                  title={`${doc.name} 预览`}
                  className="h-72 w-full"
                />
              )}
            </div>
          ) : (
            <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-large border border-dashed border-color-border-2 text-muted-foreground">
              <FileText className="size-5 opacity-60" aria-hidden="true" />
              <p className="text-[11px]">
                {previewUrl
                  ? '该类型暂不支持内嵌预览，可下载查看'
                  : '预览地址获取失败，可下载查看'}
              </p>
            </div>
          )}

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
            <UploadSimple className="size-4" />
            替换文件
          </Button>
          {previewUrl ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
            >
              <DownloadSimple className="size-4" />
              下载
            </Button>
          ) : null}
          <Button
            variant="destructive"
            size="sm"
            disabled={!canDeleteDocument(doc.status)}
            onClick={() => setDeleteOpen(true)}
          >
            <TrashSimple className="size-4" />
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
