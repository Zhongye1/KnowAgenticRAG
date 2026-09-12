"""stream_bridge 契约测试（spec §7 红线 1：图细节不外泄，D25 事件序列稳定）。"""

from __future__ import annotations

import asyncio

from typing import Any

from langgraph.graph import END, START, StateGraph

from backend.src.app.agent.graph.state import AgentState
from backend.src.app.agent.graph.stream_bridge import (
    build_done_payload,
    emit_citation,
    emit_delta,
    emit_meta,
    emit_step,
    emit_usage,
    run_agent_stream,
    translate,
)


def _full_node(state: AgentState) -> dict[str, Any]:
    """一个发满全部信封类型的节点，用于断言映射完整性。"""
    steps = [emit_step('plan', '2 路子查询')]
    emit_meta({'kb_name': 'finance', 'mode': 'hybrid', 'model_spec': 'p:m', 'hit_count': 2, 'visual_count': 1})
    emit_citation([{'n': 1, 'chunk_id': 'c1'}], [{'image_id': 'i1'}])
    emit_delta('答')
    emit_delta('案')
    emit_delta('')  # 空增量不发事件
    usage = {'prompt_tokens': 10, 'completion_tokens': 2, 'total_tokens': 12}
    emit_usage(usage)
    return {
        'answer': '答案',
        'kb_name': 'finance',
        'kb_names': ['finance'],
        'hits': [{'chunk_id': 'c1'}, {'chunk_id': 'c2'}],
        'visual_items': [{'image_id': 'i1'}],
        'retrieval': {'mode': 'hybrid', 'route': {'mode': 'hybrid', 'selected': ['text']}},
        'need_retrieval': True,
        'sub_queries': ['甲', '乙'],
        'grade_score': 0.42,
        'rewrite_count': 1,
        'steps': steps,
        'usage': usage,
    }


def _graph() -> Any:
    builder = StateGraph(AgentState)
    builder.add_node('only', _full_node)
    builder.add_edge(START, 'only')
    builder.add_edge('only', END)
    return builder.compile()


def _collect() -> list[tuple[str, dict[str, Any]]]:
    async def _run() -> list[tuple[str, dict[str, Any]]]:
        return [event async for event in run_agent_stream(_graph(), {'query': '问'})]

    return asyncio.run(_run())


def test_event_sequence_is_d25_compliant() -> None:
    events = _collect()
    assert [name for name, _ in events] == ['step', 'meta', 'citation', 'delta', 'delta', 'usage', 'done']


def test_step_payload_shape() -> None:
    events = _collect()
    assert events[0][1] == {'name': 'plan', 'detail': '2 路子查询'}


def test_meta_and_citation_payloads_pass_through() -> None:
    events = dict(_collect())
    assert events['meta']['hit_count'] == 2
    assert events['citation'] == {'citations': [{'n': 1, 'chunk_id': 'c1'}], 'images': [{'image_id': 'i1'}]}


def test_delta_content_joined_in_done() -> None:
    events = dict(_collect())
    assert events['done']['answer'] == '答案'
    assert events['done']['usage'] == {'prompt_tokens': 10, 'completion_tokens': 2, 'total_tokens': 12}


def test_done_is_self_contained_with_agent_metadata() -> None:
    done = dict(_collect())['done']
    assert done['reason'] == 'complete'
    assert done['hit_count'] == 2
    assert done['visual_count'] == 1
    assert done['agent'] == {
        'need_retrieval': True,
        'sub_queries': ['甲', '乙'],
        'plan_rationale': '',
        'grade_score': 0.42,
        'rewrites': 1,
    }
    # 自包含：客户端只消费 done 即可重建引用之外的全部信息
    assert done['kb_names'] == ['finance']
    assert done['route']['selected'] == ['text']
    assert done['citations'] == []
    assert len(done['steps']) == 1


def test_translate_unknown_or_malformed_envelope_is_none() -> None:
    assert translate(None) is None
    assert translate('nope') is None
    assert translate({'type': 'unknown'}) is None
    assert translate({'type': 'delta', 'content': ''}) is None


def test_emit_outside_graph_run_is_noop() -> None:
    """图外调用 emit_* 不抛异常（节点可脱离图单测）。"""
    assert emit_step('plan', 'x') == {'name': 'plan', 'detail': 'x'}
    emit_meta({'a': 1})
    emit_citation([])
    emit_delta('x')
    emit_usage(None)


def test_build_done_payload_handles_empty_state() -> None:
    done = build_done_payload({})
    assert not done['answer']
    assert done['usage'] == {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    # 未检索路径（T1）：mode/route 显式标注 none，而非伪装成检索过
    assert done['mode'] == 'none'
    assert done['route']['mode'] == 'none'
    assert done['route']['selected'] == []
