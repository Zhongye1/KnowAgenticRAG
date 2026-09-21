import {
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import { getFileExtension } from './file-utils'

type FileIconMeta = {
  Icon: LucideIcon
  /** 图标颜色 class，仅使用设计 token 语义色。 */
  className: string
}

const FILE_ICON_META: Readonly<Record<string, FileIconMeta>> = {
  pdf: { Icon: FileText, className: 'text-danger-6' },
  doc: { Icon: FileText, className: 'text-primary-6' },
  docx: { Icon: FileText, className: 'text-primary-6' },
  xls: { Icon: FileSpreadsheet, className: 'text-success-6' },
  xlsx: { Icon: FileSpreadsheet, className: 'text-success-6' },
  csv: { Icon: FileSpreadsheet, className: 'text-success-6' },
  ppt: { Icon: Presentation, className: 'text-warning-6' },
  pptx: { Icon: Presentation, className: 'text-warning-6' },
  md: { Icon: FileText, className: 'text-primary-6' },
  markdown: { Icon: FileText, className: 'text-primary-6' },
  txt: { Icon: FileText, className: 'text-muted-foreground' },
  html: { Icon: FileCode, className: 'text-warning-6' },
  htm: { Icon: FileCode, className: 'text-warning-6' },
  json: { Icon: FileText, className: 'text-muted-foreground' },
  png: { Icon: FileImage, className: 'text-success-6' },
  jpg: { Icon: FileImage, className: 'text-success-6' },
  jpeg: { Icon: FileImage, className: 'text-success-6' },
  gif: { Icon: FileImage, className: 'text-success-6' },
  webp: { Icon: FileImage, className: 'text-success-6' },
  svg: { Icon: FileImage, className: 'text-success-6' },
  zip: { Icon: FileArchive, className: 'text-warning-6' },
  mp4: { Icon: FileVideo, className: 'text-primary-6' },
}

const FALLBACK_META: FileIconMeta = { Icon: File, className: 'text-muted-foreground' }

type DocumentFileIconProps = {
  filename?: string | null
  sourceType?: string | null
  className?: string
}

export function DocumentFileIcon({
  filename,
  sourceType,
  className,
}: DocumentFileIconProps) {
  const extension = getFileExtension(filename)
  const meta =
    (extension && FILE_ICON_META[extension]) ||
    (sourceType === 'image' && FILE_ICON_META.png) ||
    FALLBACK_META
  const IconComponent = meta.Icon
  return (
    <IconComponent
      aria-hidden="true"
      className={cn('size-4 shrink-0', meta.className, className)}
    />
  )
}
