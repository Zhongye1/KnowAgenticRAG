"""摄取限额（双管线 spec D8）契约：错误码、边界、对外文案与「对外可见」标记。

限额是**用户可自行处置**的失败（换个文件/拆一下就行），所以 ``to_detail()``
显式打 ``public: True``，让 prod 的脱敏口径放行这段文案
（见 ``common/exception/exception_handler.py`` 与中间件与异常处理 §6.3）。
对外文案只保留用户能行动的信息，引擎名/库报错这类内部细节只进日志。
"""

from __future__ import annotations

import pytest

from backend.src.app.ingest.limits import (
    IngestLimitError,
    check_pdf_page_limit,
    check_size_limit,
    count_pdf_pages,
)
from backend.src.common.log import log
from backend.src.core.config import settings


def test_to_detail_marks_public_and_carries_suggestion() -> None:
    """detail 形状：code/reason/suggestion + public 标记，且 reason 是可读文案。"""
    detail = IngestLimitError('pdf_too_many_pages', 'PDF 共 300 页，超过上限 200 页', '请拆分').to_detail()

    assert detail['code'] == 'pdf_too_many_pages'
    assert detail['reason'] == 'PDF 共 300 页，超过上限 200 页'
    assert detail['suggestion'] == '请拆分'
    assert detail['public'] is True, '限额文案要在 prod 也放行，必须显式声明'


def test_to_detail_omits_missing_suggestion() -> None:
    """没有纠正建议时不输出 suggestion 键（前端不需要区分空字符串与缺失）。"""
    assert 'suggestion' not in IngestLimitError('pdf_unreadable', 'PDF 无法解析').to_detail()


def test_size_limit_boundary(monkeypatch: pytest.MonkeyPatch) -> None:
    """等于上限放行、超一字节即拒（阈值来自 settings，用例压到 8 字节）。"""
    monkeypatch.setattr(settings, 'RAGF_INGEST_LIMITS_ENABLED', True)
    monkeypatch.setattr(settings, 'RAGF_INGEST_MAX_FILE_BYTES', 8)

    check_size_limit(8)

    with pytest.raises(IngestLimitError) as exc:
        check_size_limit(9)
    assert exc.value.code == 'file_too_large'
    assert '9' in exc.value.reason and '8' in exc.value.reason


def test_page_limit_boundary(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_INGEST_LIMITS_ENABLED', True)
    monkeypatch.setattr(settings, 'RAGF_INGEST_MAX_PDF_PAGES', 200)

    check_pdf_page_limit(200)

    with pytest.raises(IngestLimitError) as exc:
        check_pdf_page_limit(201)
    assert exc.value.code == 'pdf_too_many_pages'
    assert '201' in exc.value.reason and '200' in exc.value.reason


def test_limits_can_be_switched_off(monkeypatch: pytest.MonkeyPatch) -> None:
    """总开关关闭时不拦（本地调试大文件的逃生口）。"""
    monkeypatch.setattr(settings, 'RAGF_INGEST_LIMITS_ENABLED', False)

    check_size_limit(10**9)
    check_pdf_page_limit(10**4)


def test_zero_threshold_disables_single_check(monkeypatch: pytest.MonkeyPatch) -> None:
    """单项阈值设为 0 = 关闭该项（不改总开关）。"""
    monkeypatch.setattr(settings, 'RAGF_INGEST_LIMITS_ENABLED', True)
    monkeypatch.setattr(settings, 'RAGF_INGEST_MAX_FILE_BYTES', 0)
    monkeypatch.setattr(settings, 'RAGF_INGEST_MAX_PDF_PAGES', 0)

    check_size_limit(10**9)
    check_pdf_page_limit(10**4)


def test_unreadable_pdf_keeps_raw_error_in_logs_only() -> None:
    """解析失败：对外只给结论 + 建议，PDFium 的原始报错只进服务端日志。

    detail 在 prod 也对外可见，库的内部术语（"Data format error" 之类）对用户没有
    行动价值，混进文案只会让人困惑。
    """
    captured: list[str] = []
    sink_id = log.add(captured.append, level='WARNING', format='{message}')

    try:
        with pytest.raises(IngestLimitError) as exc:
            count_pdf_pages(b'definitely not a pdf')
    finally:
        log.remove(sink_id)

    error = exc.value
    assert error.code == 'pdf_unreadable'
    assert error.reason == 'PDF 无法解析（页数校验失败）'
    assert error.suggestion, '必须给出用户可执行的下一步'
    assert 'PDFium' not in error.reason, '内部库名不该出现在对外文案里'
    assert error.to_detail()['public'] is True
    assert any('PDF 页数统计失败' in message for message in captured), captured
