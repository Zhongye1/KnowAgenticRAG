"""act 节点「计划子查询融合召回」测试（D41 的 agent 侧落点）。

不构造内层 ReAct：只验证服务端预取（一次检索调用、命中进收集器、失败不阻断）与
任务提示词对已收集证据的交代。
"""

from __future__ import annotations

import asyncio

from typing import Any

from backend.src.app.agent.graph.nodes import act as act_mod
from backend.src.app.agent.graph.nodes.act import build_task_prompt, prefetch_evidence
from backend.src.app.agent.graph.tools import ToolContext


class _StubRetrieval:
    def __init__(self, *, results: list[dict[str, Any]] | None = None, boom: bool = False) -> None:
        self.results = results or []
        self.boom = boom
        self.calls: list[dict[str, Any]] = []

    async def search_multi(self, db: Any, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        if self.boom:
            raise RuntimeError('检索不可用')
        return {'results': self.results, 'mode': 'hybrid', 'kb_names': kwargs['kb_names']}


class _Scope:
    allowed_kbs = ['dev']


def _ctx(**overrides: Any) -> Any:
    base: dict[str, Any] = {
        'db': None,
        'scope': _Scope(),
        'plugin_namespace': 'core',
        'kb_names': ['dev', 'ops'],
    }
    base.update(overrides)
    return ToolContext(**base)


def test_prefetch_uses_planned_sub_queries_in_one_call(monkeypatch: Any) -> None:
    """子查询一次交给检索层（query_texts），并保留原始问题作精排判据。"""
    stub = _StubRetrieval(results=[{'chunk_id': 'c1'}])
    monkeypatch.setattr(act_mod, 'retrieval_service', stub)
    ctx = _ctx()
    asyncio.run(prefetch_evidence(ctx, query='原问题', sub_queries=['甲', '乙']))
    assert len(stub.calls) == 1
    assert stub.calls[0]['query_texts'] == ['甲', '乙']
    assert stub.calls[0]['query_text'] == '原问题'
    assert stub.calls[0]['kb_names'] == ['dev']  # 与 scope.allowed_kbs 求交（防 IDOR）
    assert [hit['chunk_id'] for hit in ctx.collected] == ['c1']
    assert ctx.last_retrieval['mode'] == 'hybrid'


def test_prefetch_failure_is_non_blocking(monkeypatch: Any) -> None:
    """预取失败不抛异常：内层工具回路仍可自行检索。"""
    monkeypatch.setattr(act_mod, 'retrieval_service', _StubRetrieval(boom=True))
    ctx = _ctx()
    asyncio.run(prefetch_evidence(ctx, query='原问题', sub_queries=['甲']))
    assert ctx.collected == []
    assert ctx.last_retrieval == {}


def test_prefetch_skips_when_no_allowed_kb(monkeypatch: Any) -> None:
    class _Denied:
        allowed_kbs = ['other']

    stub = _StubRetrieval(results=[{'chunk_id': 'c1'}])
    monkeypatch.setattr(act_mod, 'retrieval_service', stub)
    ctx = _ctx(scope=_Denied())
    asyncio.run(prefetch_evidence(ctx, query='原问题', sub_queries=['甲']))
    assert stub.calls == []
    assert ctx.collected == []


def test_task_prompt_reports_prefetched_evidence() -> None:
    prompt = build_task_prompt(['甲', '乙'], collected=3)
    assert '现有 3 条命中' in prompt
    assert '- 甲' in prompt and '- 乙' in prompt
    assert '现有' not in build_task_prompt(['甲'])
