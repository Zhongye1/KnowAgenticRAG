/** 文件通用工具（扩展名/大小/来源类型展示）。 */

export const getFileExtension = (filename?: string | null): string => {
  if (!filename) return ''
  const dot = filename.lastIndexOf('.')
  if (dot <= 0 || dot === filename.length - 1) return ''
  return filename.slice(dot + 1).toLowerCase()
}

export const formatFileSize = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

export const formatDate = (value?: string | null): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 来源类型展示文案：file=本地文件；url/workspace 等由后端扩展时补充。 */
export const getSourceTypeLabel = (sourceType?: string | null): string => {
  if (!sourceType) return '-'
  const labels: Record<string, string> = {
    file: '本地文件',
    url: 'URL 抓取',
    workspace: '工作区导入',
  }
  return labels[sourceType] ?? sourceType
}
