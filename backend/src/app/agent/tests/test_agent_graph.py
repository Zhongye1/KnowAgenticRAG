"""外层图拓扑与 T1/T3 行为测试（替身节点，不依赖真实模型与数据库）。

覆盖：不检索即回答（T1）、低分触发一次改写（T3）、改写预算封顶不死循环、
节点级策略不改变事件契约（step* → meta → citation → delta* → usage → done）。
"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING, Any, cast

from backend.src.app.agent.graph.builder import AgentGraphConfig, build_agent_graph
from backend.src.app.agent.graph.nodes.grade import make_grade_node
from backend.src.app.agent.graph.nodes.plan import Plan, make_plan_node
from backend.src.app.agent.graph.nodes.rewrite import make_rewrite_node
from backend.src.app.agent.graph.stream_bridge import (
    emit_citation,
    emit_delta,
    emit_meta,
    emit_step,
    emit_usage,
    run_agent_stream,
)
from backend.src.app.agent.graph.tools import ToolContext

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

_HIT_HIGH = {'chunk_id': 'doc-1:1:0', 'document_id': 'doc-1', 'kb_name': 'dev', 'metadata': {'score': 0.9}}
_HIT_LOW = {'chunk_id': 'doc-2:1:0', 'document_id': 'doc-2', 'kb_name': 'dev', 'metadata': {'score': 0.05}}
_USE_SENTINEL = object()


def _tool_ctx() -> ToolContext:
    # 替身节点不触达存储，db/scope 仅占位
    return ToolContext(db=cast('AsyncSession', None), scope=None, plugin_namespace=None, kb_names=['dev'])


def _stub_plan(*, need_retrieval: bool) -> Any:
    def plan_node(state: dict[str, Any]) -> dict[str, Any]:
        return {
            'need_retrieval': need_retrieval,
            'sub_queries': ['甲'] if need_retrieval else [],
            'steps': [emit_step('plan', f'need_retrieval={need_retrieval}')],
        }

    return plan_node


def _stub_act(*, hit: dict[str, Any], calls: list[int]) -> Any:
    def act_node(state: dict[str, Any]) -> dict[str, Any]:
        calls.append(1)
        return {'hits': [hit], 'steps': [emit_step('act', f'第 {len(calls)} 次检索')]}

    return act_node


def _stub_rewrite(*, calls: list[int]) -> Any:
    def rewrite_node(state: dict[str, Any]) -> dict[str, Any]:
        calls.append(1)
        return {
            'sub_queries': [f'改写{len(calls)}'],
            'rewrite_count': int(state.get('rewrite_count') or 0) + 1,
            'steps': [emit_step('rewrite', f'第 {len(calls)} 次改写')],
        }

    return rewrite_node


def _stub_generate(*, reply: str) -> Any:
    """镜像真实 generate 节点的事件顺序（step → meta → citation → delta → usage）。"""

    def generate_node(state: dict[str, Any]) -> dict[str, Any]:
        hits = list(state.get('hits') or [])
        steps = [emit_step('generate', '完成')]
        emit_meta({
            'kb_name': 'dev',
            'mode': 'hybrid',
            'model_spec': 'p:m',
            'hit_count': len(hits),
            'visual_count': 0,
        })
        emit_citation(hits, [])
        emit_delta(reply)
        emit_usage({'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2})
        return {
            'answer': reply,
            'reason': 'complete',
            'citations': hits,
            'usage': {'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2},
            'steps': steps,
        }

    return generate_node


def _run(*, config: AgentGraphConfig, nodes: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    async def _collect() -> list[tuple[str, dict[str, Any]]]:
        graph = build_agent_graph(tool_ctx=_tool_ctx(), config=config, nodes=nodes)
        return [event async for event in run_agent_stream(graph, {'query': '问', 'kb_names': ['dev']})]

    return asyncio.run(_collect())


def _names(events: list[tuple[str, dict[str, Any]]]) -> list[str]:
    return [name for name, _ in events]


def _step_names(events: list[tuple[str, dict[str, Any]]]) -> list[str]:
    return [data['name'] for name, data in events if name == 'step']


def _nodes(
    *,
    hit: dict[str, Any],
    reply: str,
    need_retrieval: bool = True,
    act_calls: list[int] | None = None,
    rewrite_calls: list[int] | None = None,
) -> dict[str, Any]:
    return {
        'plan': _stub_plan(need_retrieval=need_retrieval),
        'act': _stub_act(hit=hit, calls=act_calls if act_calls is not None else []),
        'grade': make_grade_node(),
        'rewrite': _stub_rewrite(calls=rewrite_calls if rewrite_calls is not None else []),
        'generate': _stub_generate(reply=reply),
    }


def test_skip_retrieval_path_never_runs_act() -> None:
    """T1：need_retrieval=false → 不经 act/grade，直接生成。"""
    act_calls: list[int] = []
    events = _run(
        config=AgentGraphConfig(kb_names=['dev']),
        nodes=_nodes(hit=_HIT_HIGH, reply='答', need_retrieval=False, act_calls=act_calls),
    )
    assert act_calls == []
    assert _step_names(events) == ['plan', 'generate']


def test_high_score_path_goes_straight_to_generate() -> None:
    """精排分达标 → 不改写。"""
    rewrite_calls: list[int] = []
    events = _run(
        config=AgentGraphConfig(kb_names=['dev'], min_score=0.3, max_rewrites=1),
        nodes=_nodes(hit=_HIT_HIGH, reply='答', rewrite_calls=rewrite_calls),
    )
    assert rewrite_calls == []
    assert _step_names(events) == ['plan', 'act', 'grade', 'generate']
    assert dict(events)['done']['agent']['rewrites'] == 0


def test_low_score_triggers_one_rewrite_then_generates() -> None:
    """T3：低分触发改写；改写后仍低分但预算用尽 → 收尾不死循环。"""
    act_calls: list[int] = []
    rewrite_calls: list[int] = []
    events = _run(
        config=AgentGraphConfig(kb_names=['dev'], min_score=0.3, max_rewrites=1),
        nodes=_nodes(hit=_HIT_LOW, reply='答', act_calls=act_calls, rewrite_calls=rewrite_calls),
    )
    assert rewrite_calls == [1]
    assert len(act_calls) == 2  # 首检 + 改写后重检
    assert _step_names(events) == ['plan', 'act', 'grade', 'rewrite', 'act', 'grade', 'generate']
    assert dict(events)['done']['agent']['rewrites'] == 1


def test_rewrite_budget_caps_the_loop() -> None:
    """预算封顶：即便阈值高到永不达标，改写次数也不超过 max_rewrites。"""
    rewrite_calls: list[int] = []
    events = _run(
        config=AgentGraphConfig(kb_names=['dev'], min_score=0.99, max_rewrites=2),
        nodes=_nodes(hit=_HIT_LOW, reply='答', rewrite_calls=rewrite_calls),
    )
    assert rewrite_calls == [1, 1]
    assert _names(events)[-1] == 'done'


def test_allow_rewrite_false_skips_self_correction() -> None:
    act_calls: list[int] = []
    rewrite_calls: list[int] = []
    events = _run(
        config=AgentGraphConfig(kb_names=['dev'], min_score=0.99, max_rewrites=3, allow_rewrite=False),
        nodes=_nodes(hit=_HIT_LOW, reply='答', act_calls=act_calls, rewrite_calls=rewrite_calls),
    )
    assert rewrite_calls == []
    assert len(act_calls) == 1
    assert _step_names(events) == ['plan', 'act', 'grade', 'generate']


def test_event_sequence_matches_d25_contract() -> None:
    """完整事件序列：step* → meta → citation → delta → usage → done。"""
    events = _run(
        config=AgentGraphConfig(kb_names=['dev'], min_score=0.3),
        nodes=_nodes(hit=_HIT_HIGH, reply='答'),
    )
    assert _names(events) == [
        'step',
        'step',
        'step',
        'step',
        'meta',
        'citation',
        'delta',
        'usage',
        'done',
    ]


def test_done_payload_is_self_contained() -> None:
    events = _run(
        config=AgentGraphConfig(kb_names=['dev'], min_score=0.3),
        nodes=_nodes(hit=_HIT_HIGH, reply='答'),
    )
    done = dict(events)['done']
    assert done['answer'] == '答'
    assert done['reason'] == 'complete'
    assert done['hit_count'] == 1
    assert done['usage'] == {'prompt_tokens': 1, 'completion_tokens': 1, 'total_tokens': 2}
    assert done['agent']['need_retrieval'] is True
    assert done['agent']['sub_queries'] == ['甲']


# --------------------------------------------------------------- 节点降级路径（2.1 / 3.2）
def test_plan_failure_degrades_to_original_query() -> None:
    """规划失败绝不中断请求：降级为「检索原问句」并留下降级理由。"""

    async def _boom(_messages: list[dict[str, str]]) -> Any:  # ruff: ignore[unused-async]  # 替身按 awaitable 契约注入
        raise RuntimeError('结构化输出不可用')

    node = make_plan_node(planner=_boom, max_sub_queries=3)
    result = asyncio.run(node({'query': '原问题'}))
    assert result['need_retrieval'] is True
    assert result['sub_queries'] == ['原问题']
    assert '降级' in result['plan_rationale']
    assert result['steps'][0]['name'] == 'plan'


def test_plan_node_dedupes_and_caps_sub_queries() -> None:
    """2.1：子查询去空白、去重、按 max_sub_queries 截断。"""

    async def _planner(_messages: list[dict[str, str]]) -> Plan:  # ruff: ignore[unused-async]  # 替身按 awaitable 契约注入
        return Plan(need_retrieval=True, sub_queries=[' 甲 ', '甲', '', '乙', '丙'], rationale='r')

    node = make_plan_node(planner=_planner, max_sub_queries=2)
    result = asyncio.run(node({'query': '原问题'}))
    assert result['sub_queries'] == ['甲', '乙']
    assert result['need_retrieval'] is True


def test_rewrite_failure_falls_back_to_original_query() -> None:
    """3.2：改写失败 → 保持原结果（回退原问句），不抛异常，仍计数一次。"""

    async def _boom(_messages: list[dict[str, str]]) -> Any:  # ruff: ignore[unused-async]  # 替身按 awaitable 契约注入
        raise RuntimeError('模型不可用')

    node = make_rewrite_node(rewriter=_boom)
    result = asyncio.run(node({'query': '原问题', 'sub_queries': ['甲'], 'rewrite_count': 0}))
    assert result['sub_queries'] == ['原问题']
    assert result['rewrite_count'] == 1
    assert result['steps'][0]['name'] == 'rewrite'
