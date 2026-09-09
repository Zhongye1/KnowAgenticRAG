import {
  formatDate,
  formatFileSize,
  getFileExtension,
  getSourceTypeLabel,
} from '../file-utils'

describe('file-utils', () => {
  it('解析小写扩展名', () => {
    expect(getFileExtension('报告.PDF')).toBe('pdf')
    expect(getFileExtension('no-extension')).toBe('')
    expect(getFileExtension(null)).toBe('')
  })

  it('格式化文件大小', () => {
    expect(formatFileSize(0)).toBe('-')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2 * 1024)).toBe('2.0 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('格式化时间并兜底非法输入', () => {
    const local = new Date(2026, 8, 3, 10, 30)
    expect(formatDate(local.toISOString())).toMatch(/^2026-09-03 10:30$/)
    expect(formatDate(null)).toBe('-')
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('来源类型展示文案', () => {
    expect(getSourceTypeLabel('file')).toBe('本地文件')
    expect(getSourceTypeLabel('url')).toBe('URL 抓取')
    expect(getSourceTypeLabel('')).toBe('-')
  })
})
