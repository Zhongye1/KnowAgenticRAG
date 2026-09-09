import { CheckCircle, CloudArrowUp, WarningCircle } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
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
import { cn } from '@/lib/utils'

import { uploadDocumentFile } from '../../../api/documents'
import {
  MAX_UPLOAD_CONCURRENCY,
  MAX_UPLOAD_FILE_SIZE_MB,
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

const getErrorMessage = (error: unknown): string => {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { msg?: string } | undefined)?.msg
    return message || '上传失败，请稍后重试'
  }
  return '上传失败，请稍后重试'
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
            errorMessage: getErrorMessage(error),
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
          <CloudArrowUp
            className="mb-1 size-6 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="text-xs font-medium">点击选择或拖拽文件到此处</span>
          <span className="text-[11px] text-muted-foreground">
            单个文件 ≤ {MAX_UPLOAD_FILE_SIZE_MB}MB
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
                className="flex items-center gap-2 rounded-medium bg-muted/40 px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-xs">
                  {task.file.name}
                </span>
                {task.state === 'uploading' ? (
                  <Spinner className="size-3.5 shrink-0 text-primary-6" />
                ) : task.state === 'success' ? (
                  <CheckCircle
                    className="size-4 shrink-0 text-success-6"
                    aria-label="上传成功"
                  />
                ) : task.state === 'queued' ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    排队中
                  </span>
                ) : (
                  <WarningCircle
                    className="size-4 shrink-0 text-danger-6"
                    aria-label="上传失败"
                  />
                )}
                {task.state === 'error' && task.errorMessage ? (
                  <span className="max-w-40 truncate text-[11px] text-danger-6">
                    {task.errorMessage}
                  </span>
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
