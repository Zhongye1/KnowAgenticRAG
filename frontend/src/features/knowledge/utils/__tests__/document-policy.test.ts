import {
  canDeleteDocument,
  canDownloadDocument,
  canReplaceDocument,
  DOCUMENT_STATUSES,
  documentStatusMeta,
  isDocumentProcessing,
} from '../document-policy'

describe('document-policy', () => {
  it('登记了后端权威状态词表', () => {
    expect(DOCUMENT_STATUSES).toEqual([
      'pending',
      'parsing',
      'indexing',
      'ready',
      'failed',
    ])
  })

  it('为已知状态提供中文标签与 tone class', () => {
    expect(documentStatusMeta('pending')).toMatchObject({ label: '待处理' })
    expect(documentStatusMeta('ready').className).toContain('text-success-6')
    expect(documentStatusMeta('failed').className).toContain('text-danger-6')
  })

  it('未知状态回退为原文并提示同步词表', () => {
    const meta = documentStatusMeta('embedding')
    expect(meta.label).toBe('embedding')
    expect(meta.className).toContain('text-muted-foreground')
  })

  it('解析/入库中判定为处理中', () => {
    expect(isDocumentProcessing('parsing')).toBe(true)
    expect(isDocumentProcessing('indexing')).toBe(true)
    expect(isDocumentProcessing('pending')).toBe(false)
    expect(isDocumentProcessing('ready')).toBe(false)
  })

  it('can* 规则：处理中不可删除与替换', () => {
    expect(canDeleteDocument('ready')).toBe(true)
    expect(canDeleteDocument('parsing')).toBe(false)
    expect(canDeleteDocument('indexing')).toBe(false)
    expect(canReplaceDocument('pending')).toBe(true)
    expect(canReplaceDocument('indexing')).toBe(false)
  })

  it('下载能力取决于对象存储落盘标记', () => {
    expect(canDownloadDocument({ source_uri: 'kb/core/kb1/x.pdf' })).toBe(true)
    expect(canDownloadDocument({ source_uri: null })).toBe(false)
  })
})
