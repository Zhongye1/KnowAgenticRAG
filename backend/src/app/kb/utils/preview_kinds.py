"""预览类别判定（kb-落地改造清单 Phase 3 / D55 §3A）。

**判定只依据服务端扩展名，绝不信任上传的 `Content-Type`**：`document_service`
把客户端提交的 `file.content_type` 原样写进 MinIO（`document_service.py:60,142`），
用它路由等于让上传者决定服务端行为（上传者声称 `application/pdf` 就能诱导服务端
走 PDF 分支）。

纯函数、无 IO，单测直覆盖；`preview_service` 负责编排，`document_service` 在
登记/替换文件时调用本模块把结果持久化到 `documents.preview_kind`。
"""

from __future__ import annotations

from pathlib import PurePosixPath

__all__ = [
    'CONVERTIBLE_OFFICE_EXTENSIONS',
    'MACRO_ENABLED_EXTENSIONS',
    'MAX_INLINE_TEXT_BYTES',
    'PREVIEW_KINDS',
    'resolve_preview_kind',
    'suffix_of',
]

# 内联文本单窗口上限（**字节**，非字符）：按字节算才能直接映射 MinIO 的 HTTP Range，
# 前端拉下一窗口用返回的 next_offset 续读。CJK 一字 3 字节，故 200KB ≈ 6.6 万汉字。
MAX_INLINE_TEXT_BYTES = 200_000

PREVIEW_KINDS = frozenset({'markdown', 'image', 'text', 'pdf', 'office', 'unsupported'})

MARKDOWN_EXTENSIONS = frozenset({'.md', '.markdown', '.mdx'})
IMAGE_EXTENSIONS = frozenset({'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'})
PDF_EXTENSIONS = frozenset({'.pdf'})

# 可交 LibreOffice 转换的 Office 格式
CONVERTIBLE_OFFICE_EXTENSIONS = frozenset({'.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp'})

# 宏启用格式显式拒绝：转换容器不执行宏，但仍不进白名单（减少攻击面）
MACRO_ENABLED_EXTENSIONS = frozenset({'.docm', '.xlsm', '.pptm', '.dotm', '.xltm'})

_TEXT_EXTENSIONS = frozenset({
    '.txt',
    '.csv',
    '.tsv',
    '.log',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.cfg',
    '.conf',
    '.xml',
    '.html',
    '.htm',
    '.css',
    '.sql',
    '.sh',
    '.bash',
    '.py',
    '.js',
    '.mjs',
    '.ts',
    '.tsx',
    '.jsx',
    '.vue',
    '.java',
    '.kt',
    '.go',
    '.rs',
    '.c',
    '.h',
    '.cpp',
    '.hpp',
    '.cs',
    '.rb',
    '.php',
    '.pl',
    '.lua',
    '.r',
    '.m',
    '.swift',
    '.scala',
    '.gradle',
    '.properties',
    '.env',
    '.dockerfile',
    '.gitignore',
})

# 无扩展名但按纯文本预览的常见文件名（Dockerfile / Makefile 等）
_TEXT_FILENAMES = frozenset({'dockerfile', 'makefile', 'license', 'readme', 'notice', 'authors'})


def suffix_of(filename: str) -> str:
    """取小写扩展名（含点）；无扩展名返回空串。"""
    return PurePosixPath(filename or '').suffix.lower()


def resolve_preview_kind(filename: str) -> str:
    """按扩展名判定预览类别；未知返回 `unsupported`（前端只给下载）。

    宏启用格式（`.docm/.xlsm/.pptm` 等）**不归入 office**，直接 unsupported：
    宁可不可预览，也不把宏文档送进转换器。
    """
    name = (filename or '').strip()
    if not name:
        return 'unsupported'
    suffix = suffix_of(name)
    if suffix in MACRO_ENABLED_EXTENSIONS:
        return 'unsupported'
    if suffix in MARKDOWN_EXTENSIONS:
        return 'markdown'
    if suffix in IMAGE_EXTENSIONS:
        return 'image'
    if suffix in PDF_EXTENSIONS:
        return 'pdf'
    if suffix in CONVERTIBLE_OFFICE_EXTENSIONS:
        return 'office'
    if suffix in _TEXT_EXTENSIONS:
        return 'text'
    if not suffix and PurePosixPath(name).name.lower() in _TEXT_FILENAMES:
        return 'text'
    return 'unsupported'
