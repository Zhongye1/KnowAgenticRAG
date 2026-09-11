"""知识库 DTO 校验测试。"""

import pytest

from pydantic import ValidationError

from backend.src.app.kb.schema.knowledge_base import KBCreateParam


def _param(
    *,
    kb_name: str = 'pharma_2025',
    display_name: str = '药品库',
    description: str = '',
    theme: str = 'blue',
    icon: str = 'database',
    pdf_text_page_ratio: float = 0.2,
    embedding_model: str = 'dashscope:qwen3.7-text-embedding-flash',
    routing_mode: str = 'auto',
) -> KBCreateParam:
    """构造完整参数（显式传全部可选字段，兼容无 pydantic 插件的类型检查）。"""
    return KBCreateParam(
        kb_name=kb_name,
        display_name=display_name,
        description=description,
        theme=theme,
        icon=icon,
        pdf_text_page_ratio=pdf_text_page_ratio,
        embedding_model=embedding_model,
        routing_mode=routing_mode,
    )


def test_kb_create_param_valid() -> None:
    """合法 kb_name 通过校验。"""
    obj = _param()
    assert obj.kb_name == 'pharma_2025'
    assert abs(obj.pdf_text_page_ratio - 0.2) < 1e-9


@pytest.mark.parametrize('name', ['Bad Name', '中文', 'Upper', 'a-b', ''])
def test_kb_create_param_invalid_kb_name(name: str) -> None:
    """非法 kb_name 触发校验错误。"""
    with pytest.raises(ValidationError):
        _param(kb_name=name)


def test_kb_create_param_ratio_clamped() -> None:
    """pdf_text_page_ratio 超出 [0, 1] 触发校验错误。"""
    with pytest.raises(ValidationError):
        _param(pdf_text_page_ratio=1.5)
