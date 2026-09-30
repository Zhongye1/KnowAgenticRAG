"""逐题评估（RAG 清单 Phase 4 / D61：Yuxi ``knowledge/eval/evaluator.py`` 迁移）。

**与 Yuxi 的核心差异在答案来源**（决策 4）：Yuxi 用 ``kb_manager.aquery`` 取召回、
再用自建 prompt 生成答案；本项目的答案是 ``ChatService.acomplete_multi`` 的产出——
即**线上链路本身**。若用自建 prompt，检索改动对"最终回答"的影响会被 prompt 层抹平，
度量与线上脱钩。

引用（``citations``）正好带 ``chunk_id``，因此检索指标可直接由同一次调用得出，
不需要为算指标再跑一遍检索。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.app.chat.schema.chat import ChatParam
from backend.src.app.chat.service.chat_service import chat_service
from backend.src.app.evaluation.service.judge import judge_correctness
from backend.src.app.evaluation.service.metrics import calculate_retrieval_metrics
from backend.src.app.retrieval.service.params import RETRIEVAL_PARAM_KEYS
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from backend.src.app.kb.service.acl.scope import Scope

__all__ = ['build_chat_param', 'evaluate_item']


def build_chat_param(*, query_text: str, retrieval_config: dict[str, Any] | None) -> ChatParam:
    """题目 + 检索配置 → ChatParam。

    只投影 ``RETRIEVAL_PARAM_KEYS`` 中 ChatParam 能表达的键：``retrieval_config`` 由
    调用方给出（可能含检索层不认的键），直接展开会因 ``extra='forbid'`` 变成 422，
    而那条报错对用户没有行动价值。未知键静默忽略，与 KB ``query_params`` 的白名单
    口径一致。
    """
    payload: dict[str, Any] = {'query_text': query_text}
    for key, value in (retrieval_config or {}).items():
        if value is None or key not in RETRIEVAL_PARAM_KEYS:
            continue
        if key in ChatParam.model_fields:
            payload[key] = value
    return ChatParam.model_validate(payload)


def _citation_chunk_ids(citations: list[Any]) -> list[str]:
    """引用 → 有序 chunk_id 列表（检索指标按序取前 K）。"""
    ids: list[str] = []
    for item in citations or []:
        chunk_id = str((item or {}).get('chunk_id') or '') if isinstance(item, dict) else ''
        if chunk_id:
            ids.append(chunk_id)
    return ids


async def evaluate_item(
    db: AsyncSession,
    *,
    kb_name: str,
    item: dict[str, Any],
    retrieval_config: dict[str, Any] | None = None,
    judge_model: Any | None = None,
    plugin_namespace: str | None = None,
    scope: Scope | None = None,
    chat: Any | None = None,
) -> dict[str, Any]:
    """跑一题：线上链路问答 → 检索指标（+ 可选 LLM Judge）。

    ``item`` 形如 ``{'query_text': str, 'gold_chunk_ids': [...], 'gold_answer': str|None}``。

    返回逐题结果字典，**不抛异常**：逐题失败（模型不可用、KB 被删）在评估语义里是
    正常结局，应记为该题 ``error_message`` 并继续跑下一题，否则一次评估会因为一道题
    而全废。失败题目的 ``metrics`` 为空 dict —— 聚合侧会把它排除出分母，而不是当 0 分。
    """
    query_text = str(item.get('query_text') or '')
    gold_chunk_ids = [str(cid) for cid in (item.get('gold_chunk_ids') or [])]
    gold_answer = item.get('gold_answer')
    result: dict[str, Any] = {
        'query_text': query_text,
        'gold_chunk_ids': gold_chunk_ids,
        'gold_answer': gold_answer,
        'generated_answer': None,
        'retrieved_chunk_ids': [],
        'citations': [],
        'usage': {},
        'metrics': {},
        'error_message': None,
    }

    service = chat or chat_service
    try:
        payload = await service.acomplete_multi(
            db,
            kb_names=[kb_name],
            param=build_chat_param(query_text=query_text, retrieval_config=retrieval_config),
            plugin_namespace=plugin_namespace,
            scope=scope,
        )
    except Exception as exc:
        log.warning('评估逐题失败（记为本题错误，继续下一题）kb={} err={}', kb_name, exc)
        result['error_message'] = f'{type(exc).__name__}: {exc}'
        return result

    citations = list(payload.get('citations') or [])
    result['generated_answer'] = str(payload.get('answer') or '')
    result['citations'] = citations
    result['retrieved_chunk_ids'] = _citation_chunk_ids(citations)
    result['usage'] = dict(payload.get('usage') or {})

    metrics: dict[str, Any] = calculate_retrieval_metrics(
        retrieved_ids=result['retrieved_chunk_ids'],
        gold_ids=gold_chunk_ids,
    )
    if gold_answer and judge_model is not None:
        verdict = await judge_correctness(
            query=query_text,
            generated_answer=result['generated_answer'],
            gold_answer=str(gold_answer),
            judge_model=judge_model,
        )
        metrics.update(verdict)
    result['metrics'] = metrics
    return result
