import { PencilSimple, TrashSimple, UploadSimple } from '@phosphor-icons/react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/form'
import { useNotifications } from '@/components/ui/notifications'

import {
  useDeleteDocument,
  useReplaceDocumentFile,
  useUpdateDocument,
} from '../../api/documents'
import type { DocumentItem } from '../../api/types'
import { canDeleteDocument, canReplaceDocument } from '../../utils/document-policy'

type DocumentActionsProps = {
  kbName: string
  doc: DocumentItem
  /** 处理中/批量删除等场景禁用整组操作。 */
  disabled?: boolean
}

export function DocumentActions({
  kbName,
  doc,
  disabled = false,
}: DocumentActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState(doc.name)
  const { addNotification } = useNotifications()

  const renameMutation = useUpdateDocument({
    mutationConfig: {
      onSuccess: (data) => {
        addNotification({
          type: 'success',
          title: '文档已重命名',
          message: data.name,
        })
        setRenameOpen(false)
      },
    },
  })

  const replaceMutation = useReplaceDocumentFile({
    mutationConfig: {
      onSuccess: (data) => {
        addNotification({
          type: 'success',
          title: '文件已替换',
          message: data.name,
        })
      },
      onError: () => {
        addNotification({
          type: 'error',
          title: '替换失败',
          message: '请检查新文件是否与其他文档重复',
        })
      },
    },
  })

  const deleteMutation = useDeleteDocument({
    mutationConfig: {
      onSuccess: () => {
        addNotification({
          type: 'success',
          title: '文档已删除',
          message: doc.name,
        })
        setDeleteOpen(false)
      },
    },
  })

  const canReplace = canReplaceDocument(doc.status)
  const canDelete = canDeleteDocument(doc.status)

  const handleReplaceFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      replaceMutation.mutate({
        kbName,
        documentId: doc.document_id,
        file,
      })
    }
    event.target.value = ''
  }

  const handleRename = () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === doc.name) {
      setRenameOpen(false)
      return
    }
    renameMutation.mutate({
      kbName,
      documentId: doc.document_id,
      name: trimmed,
    })
  }

  const handleDelete = () => {
    deleteMutation.mutate({ kbName, documentId: doc.document_id })
  }

  return (
    <div className="flex items-center gap-0.5">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleReplaceFile}
      />
      <Button
        variant="ghost"
        size="sm"
        title="替换文件"
        aria-label={`替换 ${doc.name} 的文件`}
        disabled={disabled || !canReplace || replaceMutation.isPending}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadSimple className="size-4" />
      </Button>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            title="重命名"
            aria-label={`重命名 ${doc.name}`}
            disabled={disabled}
          >
            <PencilSimple className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名文档</DialogTitle>
            <DialogDescription>
              {doc.document_id} · 仅更新名称，不改变文件内容
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="doc-name">文档名称</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                取消
              </Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={renameMutation.isPending}
              onClick={handleRename}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            title="删除文档"
            aria-label={`删除 ${doc.name}`}
            disabled={disabled || !canDelete}
          >
            <TrashSimple className="size-4" />
          </Button>
        </DialogTrigger>
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
              onClick={handleDelete}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
