"""Agent 服务门面测试（替身图 + 替身 dao/gateway，不触达模型与存储）。

覆盖 spec D36 的三重预算收紧与 D35/D38 的双形态同源（``acomplete`` = 消费
``astream`` 取 done）、以及语义错误 → ``error`` 事件的映射。
"""

from __future__ import annotations

import asyncio

from types import SimpleNamespace
from typing import Any, cast

import pytest

from backend.src.app.agent.graph.builder import build_agent_graph
from backend.src.app.agent.graph.stream_bridge import emit_citation, emit_delta, emit_meta, emit_step, emit_usage
from backend.src.app.agent.schema.agent import AgentParam
from backend.src.app.agent.service.agent_service import AgentService
from backend.src.app.model_provider.cache import ModelInfo
from backend.src.common.exception import errors
from backend.src.core.config import settings

_HIT = {
    'chunk_id': 'doc-1:1:0',
    'document_id': 'doc-1',
    'kb_name': 'dev',
    'content': '原文',
    'metadata': {'score': 0.9},
}


def _model_info() -> ModelInfo:
    return ModelInfo(
        provider_id='acme',
        model_id='qwen-max',
        model_type='chat',
        display_name='qwen-max',
        api_key='sk-test',
        base_url='http://llm.local/v1',
        provider_type='openai',
    )


class _Gateway:
    async def get(self, db: Any, spec: str) -> ModelInfo:  # 替身需 await
        return _model_info()


def _kb_dao(*, found: bool) -> Any:
    async def _get(  # ruff: ignore[unused-async]  # 替换 knowledge_base_dao.get（被 await 调用）
        db: Any, kb_name: str, *, plugin_namespace: str | None = None
    ) -> Any:
        return SimpleNamespace(kb_name=kb_name) if found else None

    return SimpleNamespace(get=_get)


def _stub_nodes(*, hits: list[dict[str, Any]]) -> dict[str, Any]:
    """替身节点：镜像真实节点的状态与事件产出（不触达模型/检索）。"""

    def plan_node(state: dict[str, Any]) -> dict[str, Any]:
        return {
            'need_retrieval': True,
            'sub_queries': ['甲'],
            'plan_rationale': '需要查资料',
            'steps': [emit_step('plan', '1 路子查询')],
        }

    def act_node(state: dict[str, Any]) -> dict[str, Any]:
        return {'hits': hits, 'visual_items': [], 'steps': [emit_step('act', f'{len(hits)} 条命中')]}

    def generate_node(state: dict[str, Any]) -> dict[str, Any]:
        kept = list(state.get('hits') or [])
        step = emit_step('generate', 'ok')
        emit_meta({'kb_name': 'dev', 'mode': 'hybrid', 'model_spec': 'acme:qwen-max', 'hit_count': len(kept)})
        emit_citation(kept, [])
        emit_delta('答案')
        emit_usage({'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2})
        return {
            'answer': '答案',
            'citations': kept,
            'model_spec': 'acme:qwen-max',
            'usage': {'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2},
            'steps': [step],
        }

    return {'plan': plan_node, 'act': act_node, 'generate': generate_node}


def _service(*, hits: list[dict[str, Any]] | None = None, found: bool = True) -> AgentService:
    nodes = _stub_nodes(hits=hits if hits is not None else [_HIT])

    def factory(*, tool_ctx: Any, config: Any, model: Any) -> Any:
        return build_agent_graph(tool_ctx=tool_ctx, config=config, model=model, nodes=nodes)

    return AgentService(model_gateway=_Gateway(), graph_factory=factory)


def _param(**overrides: Any) -> AgentParam:
    base: dict[str, Any] = {'query_text': '问', 'model': 'acme:qwen-max'}
    base.update(overrides)
    return AgentParam(**base)


def _collect(service: AgentService, db: Any, param: AgentParam) -> list[tuple[str, dict[str, Any]]]:
    async def _run() -> list[tuple[str, dict[str, Any]]]:
        return [
            event async for event in service.astream(cast('Any', db), kb_name='dev', param=param, plugin_namespace=None)
        ]

    return asyncio.run(_run())


# --------------------------------------------------------------------- 预算（D36）
def test_step_budget_clamped_by_server_hard_limit() -> None:
    budget = AgentService._resolve_budget(_param(max_steps=999))
    assert budget.max_steps == int(settings.RAGF_AGENT_MAX_STEPS_HARD)


def test_rewrite_budget_zeroed_when_client_disables() -> None:
    budget = AgentService._resolve_budget(_param(allow_rewrite=False))
    assert budget.max_rewrites == 0
    assert budget.allow_rewrite is False


def test_sub_query_and_score_overrides_are_clamped() -> None:
    budget = AgentService._resolve_budget(_param(max_sub_queries=10, min_score=0.75))
    assert budget.max_sub_queries == int(settings.RAGF_AGENT_MAX_SUB_QUERIES)
    assert budget.min_score == pytest.approx(0.75)


def test_recursion_limit_covers_one_rewrite_cycle() -> None:
    """默认步数预算下，plan→act→grade→rewrite→act→grade→generate 必须跑得完。"""
    budget = AgentService._resolve_budget(_param())
    assert budget.recursion_limit() >= 7


# --------------------------------------------------------------------- 双形态同源
def test_astream_emits_d25_events_with_self_contained_done(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service()
    monkeypatch.setattr('backend.src.app.agent.service.agent_service.knowledge_base_dao', _kb_dao(found=True))
    events = _collect(service, object(), _param())
    names = [name for name, _ in events]
    assert names == ['step', 'step', 'step', 'step', 'meta', 'citation', 'delta', 'usage', 'done']
    done = dict(events)['done']
    assert done['answer'] == '答案'
    assert done['model_spec'] == 'acme:qwen-max'
    assert done['citations'][0]['chunk_id'] == 'doc-1:1:0'
    assert done['agent']['plan_rationale'] == '需要查资料'
    assert done['agent']['need_retrieval'] is True


def test_acomplete_returns_the_same_done_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service()
    monkeypatch.setattr('backend.src.app.agent.service.agent_service.knowledge_base_dao', _kb_dao(found=True))

    async def _run() -> dict[str, Any]:
        return await service.acomplete(cast('Any', object()), kb_name='dev', param=_param(), plugin_namespace=None)

    data = asyncio.run(_run())
    assert data['answer'] == '答案'
    assert data['hit_count'] == 1
    assert data['agent']['grade_score'] == pytest.approx(0.9)


# --------------------------------------------------------------------- 错误面
def test_unknown_kb_maps_to_kb_not_found_event(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service()
    monkeypatch.setattr('backend.src.app.agent.service.agent_service.knowledge_base_dao', _kb_dao(found=False))
    events = _collect(service, object(), _param())
    assert events[0][0] == 'error'
    assert events[0][1]['code'] == 'KB_NOT_FOUND'
    assert events[0][1]['msg'] == '知识库不存在: dev'


def test_missing_model_spec_maps_to_model_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service()
    monkeypatch.setattr('backend.src.app.agent.service.agent_service.knowledge_base_dao', _kb_dao(found=True))
    monkeypatch.setattr(settings, 'RAGF_AGENT_MODEL_SPEC', '')
    monkeypatch.setattr(settings, 'RAGF_CHAT_MODEL_SPEC', '')
    events = _collect(service, object(), _param(model=None))
    assert events[0][0] == 'error'
    assert events[0][1]['code'] == 'MODEL_NOT_CONFIGURED'


def test_acomplete_raises_http_error_for_semantic_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service()
    monkeypatch.setattr('backend.src.app.agent.service.agent_service.knowledge_base_dao', _kb_dao(found=False))

    async def _run() -> None:
        await service.acomplete(cast('Any', object()), kb_name='dev', param=_param(), plugin_namespace=None)

    with pytest.raises(errors.NotFoundError):
        asyncio.run(_run())
