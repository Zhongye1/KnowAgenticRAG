import {
  ALLOWED_EXTENSIONS_SET,
  getUploadValidationError,
  MAX_UPLOAD_FILE_SIZE_MB,
} from '../upload-limits'

const fileLike = (name: string, size = 1024) => ({ name, size })

describe('upload-limits', () => {
  it('允许常见文档与图片扩展名', () => {
    expect(ALLOWED_EXTENSIONS_SET.has('pdf')).toBe(true)
    expect(ALLOWED_EXTENSIONS_SET.has('docx')).toBe(true)
    expect(ALLOWED_EXTENSIONS_SET.has('md')).toBe(true)
    expect(ALLOWED_EXTENSIONS_SET.has('png')).toBe(true)
    expect(ALLOWED_EXTENSIONS_SET.has('exe')).toBe(false)
  })

  it('拒绝不支持的扩展名', () => {
    expect(getUploadValidationError(fileLike('run.exe'))).toContain(
      '不支持的文件类型',
    )
  })

  it('拒绝超限文件', () => {
    const tooBig = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024 + 1
    expect(getUploadValidationError(fileLike('a.pdf', tooBig))).toContain(
      '上限',
    )
  })

  it('合法文件返回 null', () => {
    expect(getUploadValidationError(fileLike('报告.pdf'))).toBeNull()
  })
})
