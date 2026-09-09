import {
  File,
  FileCsv,
  FileDoc,
  FileHtml,
  FileImage,
  FileMd,
  FilePdf,
  FilePpt,
  FileText,
  FileVideo,
  FileXls,
  FileZip,
  type Icon,
} from '@phosphor-icons/react'

import { cn } from '@/lib/utils'

import { getFileExtension } from './file-utils'

type FileIconMeta = {
  Icon: Icon
  /** 图标颜色 class，仅使用设计 token 语义色。 */
  className: string
}

const FILE_ICON_META: Readonly<Record<string, FileIconMeta>> = {
  pdf: { Icon: FilePdf, className: 'text-danger-6' },
  doc: { Icon: FileDoc, className: 'text-primary-6' },
  docx: { Icon: FileDoc, className: 'text-primary-6' },
  xls: { Icon: FileXls, className: 'text-success-6' },
  xlsx: { Icon: FileXls, className: 'text-success-6' },
  csv: { Icon: FileCsv, className: 'text-success-6' },
  ppt: { Icon: FilePpt, className: 'text-warning-6' },
  pptx: { Icon: FilePpt, className: 'text-warning-6' },
  md: { Icon: FileMd, className: 'text-primary-6' },
  markdown: { Icon: FileMd, className: 'text-primary-6' },
  txt: { Icon: FileText, className: 'text-muted-foreground' },
  html: { Icon: FileHtml, className: 'text-warning-6' },
  htm: { Icon: FileHtml, className: 'text-warning-6' },
  json: { Icon: FileText, className: 'text-muted-foreground' },
  png: { Icon: FileImage, className: 'text-success-6' },
  jpg: { Icon: FileImage, className: 'text-success-6' },
  jpeg: { Icon: FileImage, className: 'text-success-6' },
  gif: { Icon: FileImage, className: 'text-success-6' },
  webp: { Icon: FileImage, className: 'text-success-6' },
  svg: { Icon: FileImage, className: 'text-success-6' },
  zip: { Icon: FileZip, className: 'text-warning-6' },
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
      weight="fill"
      aria-hidden="true"
      className={cn('size-4 shrink-0', meta.className, className)}
    />
  )
}
