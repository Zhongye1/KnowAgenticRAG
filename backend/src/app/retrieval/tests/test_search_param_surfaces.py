"""检索参数在三层参数面上的**覆盖性**闸门。

背景：`keyword` 模式与融合参数（D57/D58）落地后，`RETRIEVAL_PARAM_KEYS` 与 KB 的
`QUERY_PARAM_WHITELIST` 有 parity 测试守着，但**请求侧的两层漏了**——
`KBSearchParam.search_mode` 与 `ChatParam.search_mode` 仍写着 `Literal['vector','hybrid']`，
且都没有融合字段。结果是：机制在检索层可用，却**没有任何 API 入口能选中它**，
而所有既有测试都是绿的。

本文件把「检索层支持的参数」与「请求面能表达的参数」对齐，任一处新增而其余处漏改
即失败。
"""

from __future__ import annotations

from typing import Literal, get_args, get_origin

import pytest

from pydantic import ValidationError

from backend.src.app.chat.schema.chat import ChatParam
from backend.src.app.chat.service.chat_service import _SEARCH_PARAM_KEYS
from backend.src.app.retrieval.schema.search_result import KBSearchParam
from backend.src.app.retrieval.service.params import FUSION_MODES, RETRIEVAL_PARAM_KEYS, SEARCH_MODES

# 请求面不承载的参数：query_text 在两层里语义不同（检索文本 vs 问题），
# file_name/filters 是文档级过滤（各有独立契约），不属"检索调参"面
_REQUEST_ONLY_KEYS = frozenset({'query_text', 'file_name', 'filters'})


def _literal_options(annotation: object) -> frozenset[str]:
    """从 ``X | None`` 里取出 Literal 的取值集合（取不到返回空集）。"""
    for arg in get_args(annotation):
        if get_origin(arg) is Literal:
            return frozenset(get_args(arg))
    return frozenset()


def test_retrieval_keys_are_expressible_on_search_param() -> None:
    """同步检索端点能表达的键必须覆盖检索层支持的全部调参键。"""
    missing = RETRIEVAL_PARAM_KEYS - set(KBSearchParam.model_fields)
    assert not missing, f'KBSearchParam 缺少检索调参键: {sorted(missing)}'


def test_retrieval_keys_are_expressible_on_chat_param() -> None:
    """chat 面同理——评估与线上都经它下发检索参数。"""
    missing = RETRIEVAL_PARAM_KEYS - set(ChatParam.model_fields)
    assert not missing, f'ChatParam 缺少检索调参键: {sorted(missing)}'


def test_chat_search_keys_projection_covers_retrieval_keys() -> None:
    """``_SEARCH_PARAM_KEYS`` 是 ChatParam → 检索参数的投影白名单，不能漏。"""
    missing = RETRIEVAL_PARAM_KEYS - _SEARCH_PARAM_KEYS
    assert not missing, f'_SEARCH_PARAM_KEYS 漏了: {sorted(missing)}'


def test_search_keys_projection_stays_within_chat_param() -> None:
    """白名单里的键必须真实存在于 ChatParam（防改名后成为死键）。"""
    stray = _SEARCH_PARAM_KEYS - set(ChatParam.model_fields)
    assert not stray, f'_SEARCH_PARAM_KEYS 含 ChatParam 不存在的键: {sorted(stray)}'
    assert _REQUEST_ONLY_KEYS <= _SEARCH_PARAM_KEYS


def test_search_mode_options_agree_across_surfaces() -> None:
    """三处 ``search_mode`` 取值必须一致（含新增 keyword）。"""
    for model in (KBSearchParam, ChatParam):
        assert _literal_options(model.model_fields['search_mode'].annotation) == SEARCH_MODES, model.__name__


def test_fusion_mode_options_agree_across_surfaces() -> None:
    for model in (KBSearchParam, ChatParam):
        assert _literal_options(model.model_fields['fusion_mode'].annotation) == FUSION_MODES, model.__name__


def test_weight_bounds_are_unit_interval() -> None:
    """权重上界必须锁在 [0,1]：越界值应在 pydantic 层就被拒，而不是靠下游 clamp。"""
    for model in (KBSearchParam, ChatParam):
        ok = model.model_validate({'query_text': 'q', 'vector_weight': 0.0, 'bm25_weight': 1.0})
        assert ok.vector_weight == pytest.approx(0.0)
        with pytest.raises(ValidationError):
            model.model_validate({'query_text': 'q', 'vector_weight': 1.5})
