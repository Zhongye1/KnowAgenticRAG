"""摄取限额前置校验（双管线摄取 spec D8，EagleRAG ingest/limits.py 迁移）。

在 MinIO 上传 / Celery 派发 / MinerU 与 Knowhere 调用**之前**拒绝超限文件，
错误结构化（code/reason/suggestion），API 层映射 422 ``detail``。当前上限对齐
MinerU 精提取 API（200 MiB / 200 页）；Knowhere api 模式底层同为 MinerU。

页数统计用仓库既有依赖 pypdfium2（rapidocr 已引入），不新增 pypdf。
"""

from __future__ import annotations

from typing import Any

__all__ = [
    'IngestLimitError',
    'check_pdf_page_limit',
    'check_size_limit',
    'count_pdf_pages',
    'strip_routing_prefix',
    'validate_ingest_bytes',
    'validate_ingest_file',
]

_ROUTING_PREFIXES = ('knowhere:', 'pixelrag:')

# 支持“真”页数统计的扩展名（其余格式只校验大小）
_PDF_SUFFIX = '.pdf'


class IngestLimitError(Exception):
    """文件超过摄取大小 / 页数上限。

    code: 机器可读错误码（file_too_large / pdf_too_many_pages / pdf_unreadable）
    reason: 人类可读原因
    suggestion: 面向终端用户的纠正建议（可为空）
    """

    def __init__(self, code: str, reason: str, suggestion: str | None = None) -> None:
        super().__init__(reason)
        self.code = code
        self.reason = reason
        self.suggestion = suggestion

    def __str__(self) -> str:
        return self.reason

    def to_detail(self) -> dict[str, Any]:
        """422 响应的 JSON ``detail`` 载荷（suggestion 为空时不输出该键）。"""
        detail: dict[str, Any] = {'code': self.code, 'reason': self.reason}
        if self.suggestion is not None:
            detail['suggestion'] = self.suggestion
        return detail


def strip_routing_prefix(filename: str) -> str:
    """剥离 ``knowhere:`` / ``pixelrag:`` 路由前缀（前缀只影响路由，不参与格式判断）。"""
    lower = filename.lower()
    for prefix in _ROUTING_PREFIXES:
        if lower.startswith(prefix):
            return filename[len(prefix) :]
    return filename


def _limits_enabled() -> bool:
    from backend.src.core.config import settings

    return bool(settings.RAGF_INGEST_LIMITS_ENABLED)


def check_size_limit(size_bytes: int) -> None:
    """超 ``RAGF_INGEST_MAX_FILE_BYTES`` 抛 ``IngestLimitError``（0 = 关闭该项）。"""
    from backend.src.core.config import settings

    if not _limits_enabled():
        return
    max_bytes = int(settings.RAGF_INGEST_MAX_FILE_BYTES)
    if max_bytes <= 0 or size_bytes <= max_bytes:
        return
    raise IngestLimitError(
        'file_too_large',
        f'文件大小 {size_bytes} 字节，超过上限 {max_bytes} 字节（MinerU 精提取 API 限制）',
        suggestion='请压缩或拆分文档后重新上传',
    )


def count_pdf_pages(source: bytes | str) -> int:
    """统计 PDF 页数（pypdfium2，接受字节流或文件路径）；无法解析抛 ``pdf_unreadable``。"""
    import pypdfium2 as pdfium

    try:
        doc = pdfium.PdfDocument(source)
    except Exception as exc:
        raise IngestLimitError(
            'pdf_unreadable',
            f'PDF 无法解析（页数校验失败）: {exc}',
            suggestion='请重新导出或修复 PDF 后重试',
        ) from exc
    try:
        return len(doc)
    finally:
        doc.close()


def check_pdf_page_limit(page_count: int) -> None:
    """超 ``RAGF_INGEST_MAX_PDF_PAGES`` 抛 ``IngestLimitError``（0 = 关闭该项）。"""
    from backend.src.core.config import settings

    if not _limits_enabled():
        return
    max_pages = int(settings.RAGF_INGEST_MAX_PDF_PAGES)
    if max_pages <= 0 or page_count <= max_pages:
        return
    raise IngestLimitError(
        'pdf_too_many_pages',
        f'PDF 共 {page_count} 页，超过上限 {max_pages} 页（MinerU 精提取 API 限制）',
        suggestion=f'请将 PDF 拆分为不超过 {max_pages} 页的多个文件分别摄取',
    )


def validate_ingest_bytes(data: bytes, filename: str) -> None:
    """对内存字节流执行限额校验（API 上传路径）。"""
    cleaned = strip_routing_prefix(filename or '')
    check_size_limit(len(data))
    if not cleaned.lower().endswith(_PDF_SUFFIX):
        return
    check_pdf_page_limit(count_pdf_pages(data))


def validate_ingest_file(path: str, filename: str) -> None:
    """对本地文件执行限额校验（worker 侧防御性复检，双管线摄取 spec D8）。

    大小走 ``stat``，PDF 页数直接以路径打开（不整读进内存）。
    """
    from pathlib import Path

    p = Path(path)
    cleaned = strip_routing_prefix(filename or p.name)
    check_size_limit(p.stat().st_size)
    if not cleaned.lower().endswith(_PDF_SUFFIX):
        return
    check_pdf_page_limit(count_pdf_pages(str(p)))
