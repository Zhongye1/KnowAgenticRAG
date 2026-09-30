"""评估运行接口（RAG 清单 Phase 4 / D61）。

发起评估是"建行 + 派发"两段：行先落库（``pending``）并提交，之后才投 Celery——顺序
与摄取一致（D66：PostgreSQL 是事实源，队列只做投递）。反过来会让 worker 拿到一个
数据库里还不存在的 run_id。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from backend.src.app.evaluation.crud import eval_dataset_dao, eval_run_dao
from backend.src.app.evaluation.schema import EvalRunCreateParam, EvalRunDetail, EvalRunItemDetail, EvalRunPageItem
from backend.src.app.kb.deps import CurrentKbUser, CurrentNamespace
from backend.src.app.kb.service.acl.resolver import Perm, perm_at_least, resolve_kb_perm
from backend.src.app.kb.utils.permissions import RAG_KB_MANAGE, RAG_KB_READ
from backend.src.common.exception import errors
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.core.config import settings
from backend.src.database.db import CurrentSessionTransaction
from backend.src.utils.snowflake import snowflake

router = APIRouter(prefix='/evaluation/runs', tags=['evaluation'])

_PERM_READ = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_READ)), DependsRBAC]
_PERM_MANAGE = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_MANAGE)), DependsRBAC]


def _to_page_item(obj: object) -> EvalRunPageItem:
    return EvalRunPageItem(
        run_id=obj.run_id,  # type: ignore[attr-defined]
        kb_name=obj.kb_name,  # type: ignore[attr-defined]
        dataset_id=obj.dataset_id,  # type: ignore[attr-defined]
        name=obj.name or '',  # type: ignore[attr-defined]
        status=obj.status,  # type: ignore[attr-defined]
        overall_score=obj.overall_score,  # type: ignore[attr-defined]
        total_items=int(obj.total_items or 0),  # type: ignore[attr-defined]
        completed_items=int(obj.completed_items or 0),  # type: ignore[attr-defined]
        started_time=obj.started_time,  # type: ignore[attr-defined]
        completed_time=obj.completed_time,  # type: ignore[attr-defined]
    )


@router.post('', summary='发起评估（落 pending 行后投递 Celery，立即返回 run_id）', dependencies=_PERM_MANAGE)
async def create_run(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
    param: EvalRunCreateParam,
) -> ResponseSchemaModel[EvalRunPageItem]:
    dataset = await eval_dataset_dao.get_dataset(db, param.dataset_id, plugin_namespace=current_namespace)
    if dataset is None:
        raise errors.NotFoundError(msg='数据集不存在')
    perm = await resolve_kb_perm(
        db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles, kb_name=dataset.kb_name
    )
    if not perm_at_least(perm, Perm.CONTRIBUTE):
        raise errors.NotFoundError(msg='数据集不存在')

    item_count = len(await eval_dataset_dao.list_items(db, param.dataset_id, plugin_namespace=current_namespace))
    if item_count == 0:
        raise errors.RequestError(msg='数据集没有题目，无法评估')
    if item_count > int(settings.RAGF_EVAL_MAX_ITEMS):
        raise errors.RequestError(msg=f'题目数 {item_count} 超过单次评估上限 {settings.RAGF_EVAL_MAX_ITEMS}')

    run_id = str(snowflake.generate())
    run = await eval_run_dao.create_run(
        db,
        run_id=run_id,
        kb_name=dataset.kb_name,
        dataset_id=param.dataset_id,
        name=param.name or f'{dataset.name} 评估',
        retrieval_config=dict(param.retrieval_config or {}),
        judge_spec=param.judge_spec or str(settings.RAGF_EVAL_JUDGE_SPEC or ''),
        total_items=item_count,
        created_by=user.user_id,
        plugin_namespace=current_namespace,
    )
    # 先提交事实再投递（D66）：反过来会让 worker 拿到库里还不存在的 run_id
    await db.commit()
    _enqueue_run(run_id, current_namespace)
    db.expire(run)
    return response_base.success(data=_to_page_item(run))


def _enqueue_run(run_id: str, plugin_namespace: str | None) -> None:
    from backend.src.app.task.celery import celery_app

    celery_app.send_task('evaluation.run_dataset', kwargs={'run_id': run_id, 'plugin_namespace': plugin_namespace})


@router.get('', summary='评估运行列表', dependencies=_PERM_READ)
async def list_runs(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str | None, Query(description='按知识库过滤')] = None,
    dataset_id: Annotated[str | None, Query(description='按数据集过滤')] = None,
    offset: Annotated[int, Query(ge=0, description='偏移')] = 0,
    limit: Annotated[int, Query(ge=1, le=200, description='每页条数')] = 50,
) -> ResponseSchemaModel[list[EvalRunPageItem]]:
    rows, _total = await eval_run_dao.list_runs(
        db,
        kb_name=kb_name,
        dataset_id=dataset_id,
        plugin_namespace=current_namespace,
        offset=offset,
        limit=limit,
    )
    return response_base.success(data=[_to_page_item(row) for row in rows])


@router.get('/{run_id}', summary='运行详情（含配置快照与聚合指标）', dependencies=_PERM_READ)
async def get_run(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    run_id: Annotated[str, Path(description='运行 ID')],
) -> ResponseSchemaModel[EvalRunDetail]:
    obj = await eval_run_dao.get_run(db, run_id, plugin_namespace=current_namespace)
    if obj is None:
        raise errors.NotFoundError(msg='评估运行不存在')
    base = _to_page_item(obj)
    return response_base.success(
        data=EvalRunDetail(
            **base.model_dump(),
            retrieval_config=dict(obj.retrieval_config or {}),
            judge_spec=obj.judge_spec or '',
            metrics={k: float(v) for k, v in (obj.metrics or {}).items() if isinstance(v, int | float)},
            error_message=obj.error_message,
        )
    )


@router.get('/{run_id}/items', summary='逐题结果（"某题为什么变差"据此回答）', dependencies=_PERM_READ)
async def list_run_items(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    run_id: Annotated[str, Path(description='运行 ID')],
) -> ResponseSchemaModel[list[EvalRunItemDetail]]:
    obj = await eval_run_dao.get_run(db, run_id, plugin_namespace=current_namespace)
    if obj is None:
        raise errors.NotFoundError(msg='评估运行不存在')
    rows = await eval_run_dao.list_items(db, run_id, plugin_namespace=current_namespace)
    return response_base.success(
        data=[
            EvalRunItemDetail(
                item_index=int(row.item_index or 0),
                query_text=row.query_text,
                gold_chunk_ids=list(row.gold_chunk_ids or []),
                gold_answer=row.gold_answer,
                generated_answer=row.generated_answer,
                retrieved_chunk_ids=list(row.retrieved_chunk_ids or []),
                metrics=dict(row.metrics or {}),
                error_message=row.error_message,
            )
            for row in rows
        ]
    )


@router.delete('/{run_id}', summary='删除运行', dependencies=_PERM_MANAGE)
async def delete_run(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    run_id: Annotated[str, Path(description='运行 ID')],
) -> ResponseSchemaModel[dict]:
    deleted = await eval_run_dao.delete_run(db, run_id, plugin_namespace=current_namespace)
    if not deleted:
        raise errors.NotFoundError(msg='评估运行不存在')
    return response_base.success(data={'run_id': run_id, 'deleted': True})
