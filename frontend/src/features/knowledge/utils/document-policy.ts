/**
 * 文档状态与操作策略（单一事实源）。
 *
 * 状态词表以后端权威值为准（backend/src/app/kb/model/document.py）：
 * pending / parsing / indexing / ready / failed。
 * 摄取管线接入前，上传落库后恒为 pending；前端不做状态扩充，
 * 只负责「视图标签 + 视觉 tone + 操作权限」的翻译。
 */

import type { DocumentItem } from '../api/types'

/** 后端权威状态词表（顺序即展示优先级）。 */
export const DOCUMENT_STATUSES = [
  'pending',
  'parsing',
  'indexing',
  'ready',
  'failed',
] as const

export type DocumentStatusMeta = {
  label: string
  /** 完整 Tailwind class，遵循仓库现有 token 写法（如 bg-warning-6/10）。 */
  className: string
  description: string
}

export const DOCUMENT_STATUS_META: Readonly<
  Record<string, DocumentStatusMeta>
> = {
  pending: {
    label: '待处理',
    className: 'bg-warning-6/10 text-warning-6',
    description: '已上传到对象存储，等待摄取管线接管',
  },
  parsing: {
    label: '解析中',
    className: 'bg-primary-6/10 text-primary-6',
    description: '正在解析文档内容',
  },
  indexing: {
    label: '入库中',
    className: 'bg-primary-6/10 text-primary-6',
    description: '正在分块并写入向量库',
  },
  ready: {
    label: '已就绪',
    className: 'bg-success-6/10 text-success-6',
    description: '完成摄取，可被检索',
  },
  failed: {
    label: '处理失败',
    className: 'bg-danger-6/10 text-danger-6',
    description: '摄取失败，可替换文件后重试',
  },
}

export const documentStatusMeta = (status?: string | null): DocumentStatusMeta =>
  (status && DOCUMENT_STATUS_META[status]) || {
    label: status || '未知',
    className: 'bg-muted text-muted-foreground',
    description: '后端返回了未登记的状态值，请同步词表',
  }

/** 进行中（非终态）状态：轮询与删除保护依赖此判断。 */
export const isDocumentProcessing = (status?: string | null): boolean =>
  status === 'parsing' || status === 'indexing'

/** 删除保护：解析/入库中的文档不可删除，避免级联清理竞态。 */
export const canDeleteDocument = (status?: string | null): boolean =>
  !isDocumentProcessing(status)

/** 替换保护：处理中替换会破坏摄取上下文，禁止。 */
export const canReplaceDocument = (status?: string | null): boolean =>
  !isDocumentProcessing(status)

/** 下载能力取决于对象存储是否已落盘（source_uri 即 object key）。 */
export const canDownloadDocument = (doc: Pick<DocumentItem, 'source_uri'>): boolean =>
  Boolean(doc.source_uri)
