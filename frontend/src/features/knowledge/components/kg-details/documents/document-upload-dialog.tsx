import { CircleAlert, CircleCheck, CloudUpload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { nanoid } from 'nanoid'
import { useEffect, useRef, useState, type DragEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { getApiErrorMessage } from '@/lib/api-error'
import { cn } from '@/lib/utils'

import { uploadDocumentFile } from '../../../api/documents'
import {
  MAX_UPLOAD_CONCURRENCY,
  MAX_UPLOAD_FILE_SIZE_MB,
  MAX_UPLOAD_PDF_PAGES,
  getUploadValidationError,
} from '../../../utils/upload-limits'

type UploadTask = {
  uid: string
  file: File
  state: 'queued' | 'uploading' | 'success' | 'error'
  errorMessage?: string
}

type DocumentUploadDialogProps = {
  kbName: string
  onClose: () => void
}

export function DocumentUploadDialog({
  kbName,
  onClose,
}: DocumentUploadDialogProps) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const invalidatedRef = useRef(false)
  const mountedRef = useRef(true)
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const busyCount = tasks.filter(
    (task) => task.state === 'uploading' || task.state === 'queued',
  ).length
  const successCount = tasks.filter((task) => task.state === 'success').length
  const errorCount = tasks.filter((task) => task.state === 'error').length
  const idle = busyCount === 0 && tasks.length > 0

  const appendFiles = (files: File[]) => {
    invalidatedRef.current = false
    const nextTasks = files.map<UploadTask>((file) => {
      const errorMessage = getUploadValidationError(file)
      return {
        uid: nanoid(),
        file,
        state: errorMessage ? 'error' : 'queued',
        errorMessage: errorMessage ?? undefined,
      }
    })
    setTasks((prev) => [...prev, ...nextTasks])
  }

  const handleFilesPicked = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    appendFiles(Array.from(fileList))
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setDragging(false)
    handleFilesPicked(event.dataTransfer.files)
  }

  const updateTask = (uid: string, patch: Partial<UploadTask>) => {
    setTasks((prev) =>
      prev.map((task) => (task.uid === uid ? { ...task, ...patch } : task)),
    )
  }

  // 并发消费队列：限制同时上传数，其余排队；每轮只启动下一个 queued 任务。
  useEffect(() => {
    const activeCount = tasks.filter(
      (task) => task.state === 'uploading',
    ).length
    if (activeCount >= MAX_UPLOAD_CONCURRENCY) return
    const nextQueued = tasks.find((task) => task.state === 'queued')
    if (!nextQueued) return

    updateTask(nextQueued.uid, { state: 'uploading' })

    void uploadDocumentFile({
      file: nextQueued.file,
      kb_name: kbName,
      source_type: 'file',
    })
      .then(() => {
        if (mountedRef.current) {
          updateTask(nextQueued.uid, { state: 'success' })
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          updateTask(nextQueued.uid, {
            state: 'error',
            // 服务端限额/校验原因（如 PDF 超页数）要如实展示给用户，
            // 不能再退化成笼统的「上传失败」。
            errorMessage: getApiErrorMessage(error, '上传失败，请稍后重试'),
          })
        }
      })
  }, [kbName, tasks])

  // 队列空闲且存在已处理任务时统一失效列表缓存
  useEffect(() => {
    if (idle && !invalidatedRef.current) {
      invalidatedRef.current = true
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] })
    }
  }, [idle, queryClient])

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>上传文档</DialogTitle>
          <DialogDescription>
            上传到「{kbName}」知识库 · 支持{' '}
            {MAX_UPLOAD_CONCURRENCY} 个文件并发，其余排队
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          className={cn(
            'flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-large border border-dashed px-4 py-6 text-center transition-colors focus-visible:border-primary-6 focus-visible:ring-1 focus-visible:ring-primary-6/50',
            dragging
              ? 'border-primary-6 bg-primary-6/5'
              : 'border-color-border-2 bg-color-bg-1 hover:border-primary-6/60',
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <CloudUpload
            className="mb-1 size-6 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="text-xs font-medium">点击选择或拖拽文件到此处</span>
          <span className="text-[11px] text-muted-foreground">
            单个文件 ≤ {MAX_UPLOAD_FILE_SIZE_MB}MB · PDF ≤{' '}
            {MAX_UPLOAD_PDF_PAGES} 页
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => handleFilesPicked(event.target.files)}
        />

        {tasks.length > 0 ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {tasks.map((task) => (
              <li
                key={task.uid}
                className="flex flex-col gap-0.5 rounded-medium bg-muted/40 px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {task.file.name}
                  </span>
                  {task.state === 'uploading' ? (
                    <Spinner className="size-3.5 shrink-0 text-primary-6" />
                  ) : task.state === 'success' ? (
                    <CircleCheck
                      className="size-4 shrink-0 text-success-6"
                      aria-label="上传成功"
                    />
                  ) : task.state === 'queued' ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      排队中
                    </span>
                  ) : (
                    <CircleAlert
                      className="size-4 shrink-0 text-danger-6"
                      aria-label="上传失败"
                    />
                  )}
                </div>
                {task.state === 'error' && task.errorMessage ? (
                  <p className="text-[11px] break-words text-danger-6">
                    {task.errorMessage}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {idle ? (
          <p className="text-center text-[11px] text-muted-foreground">
            共 {tasks.length} 个文件 · 成功 {successCount}
            {errorCount > 0 ? ` · 失败 ${errorCount}` : ''}
          </p>
        ) : busyCount > 0 ? (
          <p className="text-center text-[11px] text-muted-foreground">
            共 {tasks.length} 个文件 · 成功 {successCount} · 失败 {errorCount} ·
            处理中 {busyCount}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={busyCount > 0}
            onClick={onClose}
          >
            {busyCount > 0 ? '上传中…' : '关闭'}
          </Button>
          {idle && successCount > 0 ? (
            <Button size="sm" onClick={onClose}>
              完成
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
