"""PDF 形态探测（双管线摄取 spec D3，EagleRAG probe_pdf_form 迁移）。

逐页抽文本（pypdfium2，仓库既有依赖），统计「有效文本页占比」与「每页均字符
数」；任一低于阈值判为 ``scanned``（→ visual 管线），否则 ``text``（→ knowhere）。
解析失败返回 ``text``：文本解析对扫描件仅退化不崩溃，保守走 Knowhere。
"""

from __future__ import annotations

__all__ = ['extract_pdf_pages_text', 'probe_pdf_form']


def extract_pdf_pages_text(file_path: str) -> list[str] | None:
    """逐页抽取 PDF 文本；打开或遍历失败返回 None。"""
    import pypdfium2 as pdfium

    try:
        doc = pdfium.PdfDocument(file_path)
    except Exception:
        return None
    pages: list[str] = []
    try:
        for page in doc:
            try:
                text_page = page.get_textpage()
                pages.append(text_page.get_text_range() or '')
                text_page.close()
            except Exception:
                pages.append('')
            finally:
                page.close()
    except Exception:
        return None
    finally:
        doc.close()
    return pages


def probe_pdf_form(
    file_path: str,
    *,
    text_page_ratio: float | None = None,
    avg_chars_per_page: int | None = None,
) -> str:
    """判定 PDF 形态：``text``（文本型）或 ``scanned``（扫描/图片型）。

    Args:
        file_path: 本地 PDF 路径。
        text_page_ratio: 有效文本页占比阈值；None 用全局 ``RAGF_PDF_PROBE_TEXT_PAGE_RATIO``。
        avg_chars_per_page: 每页均字符数阈值；None 用全局 ``RAGF_PDF_PROBE_AVG_CHARS_PER_PAGE``。

    Returns:
        ``'text'`` 或 ``'scanned'``。
    """
    from backend.src.core.config import settings

    ratio_threshold = (
        float(text_page_ratio) if text_page_ratio is not None else float(settings.RAGF_PDF_PROBE_TEXT_PAGE_RATIO)
    )
    chars_threshold = (
        int(avg_chars_per_page) if avg_chars_per_page is not None else int(settings.RAGF_PDF_PROBE_AVG_CHARS_PER_PAGE)
    )

    pages_text = extract_pdf_pages_text(file_path)
    if not pages_text:
        return 'text'

    total_pages = len(pages_text)
    text_pages = sum(1 for t in pages_text if len(t or '') > chars_threshold)
    text_ratio = text_pages / total_pages
    avg_chars = sum(len(t or '') for t in pages_text) / total_pages

    if text_ratio < ratio_threshold or avg_chars < chars_threshold:
        return 'scanned'
    return 'text'
