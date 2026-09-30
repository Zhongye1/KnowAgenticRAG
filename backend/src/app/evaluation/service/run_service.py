"""评估运行编排（RAG 清单 Phase 4 / D61）。

与 Celery 解耦：本模块只做"跑完一次评估"，任务层是它的薄包装。这样编排逻辑可以
零基础设施单测（注入 chat/judge 替身），而任务层只负责开会话与异常兜底。

**逐题落库而非最后一次性写**：一次评估可能跑几百题、耗时数分钟，中途失败也应保留
已完成的部分——「跑到第 80 题挂了」比「什么都没留下」有用得多。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.app.evaluation.crud import eval_dataset_dao, eval_run_dao
from backend.src.app.evaluation.service.evaluator import evaluate_item
from backend.src.app.evaluation.service.metrics import aggregate_metrics, overall_score
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['execute_run']


async def _resolve_judge(db: AsyncSession, spec: str) -> Any | None:
    """按 spec 取 Judge 模型；未配置时返回 None（评估退化为只算检索指标）。"""
    normalized = str(spec or '').strip()
    if not normalized:
        return None
    from backend.src.app.model_provider.service.provider_service import provider_service

    try:
        return await provider_service.get_chat_model(db, normalized)
    except Exception as exc:
        log.warning('Judge 模型不可用，本次评估只算检索指标 spec={} err={}', normalized, exc)
        return None


async def execute_run(
    db: AsyncSession,
    *,
    run_id: str,
    plugin_namespace: str | None = None,
    chat: Any | None = None,
    judge_model: Any | None = None,
) -> dict[str, Any]:
    """执行一次评估并落终态，返回摘要 ``{'status', 'completed_items', 'overall_score'}``。

    ``chat`` / ``judge_model`` 可注入（测试免依赖模型服务）；不注入时 Judge 按 run 行上
    的 ``judge_spec`` 快照解析，未配置则只算检索指标。

    已非 ``pending`` 的 run 直接返回 ``skipped``：Celery 的 at-least-once 语义下同一个
    run 可能被投递多次，靠状态机而不是锁来保证不重跑。
    """
    run = await eval_run_dao.get_run(db, run_id, plugin_namespace=plugin_namespace)
    if run is None:
        return {'status': 'missing', 'completed_items': 0, 'overall_score': None}
    if not await eval_run_dao.mark_running(db, run_id, plugin_namespace=plugin_namespace):
        return {'status': 'skipped', 'completed_items': int(run.completed_items or 0), 'overall_score': None}
    await db.commit()

    dataset_id = str(run.dataset_id or '')
    items = await eval_dataset_dao.list_items(db, dataset_id, plugin_namespace=plugin_namespace) if dataset_id else []
    if not items:
        await eval_run_dao.finish(
            db,
            run_id,
            status='failed',
            error_message='数据集不存在或没有题目',
            plugin_namespace=plugin_namespace,
        )
        await db.commit()
        return {'status': 'failed', 'completed_items': 0, 'overall_score': None}

    judge = judge_model if judge_model is not None else await _resolve_judge(db, run.judge_spec)
    per_item: list[dict[str, Any]] = []
    try:
        for index, item in enumerate(items):
            result = await evaluate_item(
                db,
                kb_name=run.kb_name,
                item={
                    'query_text': item.query_text,
                    'gold_chunk_ids': list(item.gold_chunk_ids or []),
                    'gold_answer': item.gold_answer,
                },
                retrieval_config=dict(run.retrieval_config or {}),
                judge_model=judge,
                plugin_namespace=plugin_namespace,
            )
            await eval_run_dao.append_item(
                db,
                run_id,
                item_index=index,
                query_text=result['query_text'],
                gold_chunk_ids=result['gold_chunk_ids'],
                gold_answer=result['gold_answer'],
                generated_answer=result['generated_answer'],
                retrieved_chunk_ids=result['retrieved_chunk_ids'],
                citations=result['citations'],
                usage=result['usage'],
                metrics=result['metrics'],
                error_message=result['error_message'],
                plugin_namespace=plugin_namespace,
            )
            await db.commit()
            per_item.append(result['metrics'])
    except Exception as exc:
        log.error('评估运行中断 run={} err={}', run_id, exc)
        await db.rollback()
        await eval_run_dao.finish(
            db, run_id, status='failed', error_message=f'{type(exc).__name__}: {exc}', plugin_namespace=plugin_namespace
        )
        await db.commit()
        raise

    aggregated = aggregate_metrics(per_item)
    await eval_run_dao.finish(
        db,
        run_id,
        status='completed',
        metrics=aggregated,
        overall_score=overall_score(per_item),
        plugin_namespace=plugin_namespace,
    )
    await db.commit()
    return {
        'status': 'completed',
        'completed_items': len(per_item),
        'overall_score': overall_score(per_item),
    }
