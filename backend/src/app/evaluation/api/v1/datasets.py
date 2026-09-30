"""评估数据集接口（RAG 清单 Phase 4 / D61）。

**权限沿用既有码**而不新造 ``rag:kb:eval``：新权限码需要同步 ``sys_menu`` seed，否则
没有任何角色持有它、路由会整体 403。评估是 KB 级管理与消费行为，故读写分别落在
``RAG_KB_MANAGE`` / ``RAG_KB_READ``。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from backend.src.app.evaluation.crud import eval_dataset_dao
from backend.src.app.evaluation.schema import (
    EvalDatasetCreateParam,
    EvalDatasetDetail,
    EvalDatasetGenerateParam,
    EvalDatasetItemDetail,
    EvalGenerateResult,
)
from backend.src.app.evaluation.service.benchmark_generation import generate_items
from backend.src.app.kb.crud import knowledge_base_dao
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

router = APIRouter(prefix='/evaluation/datasets', tags=['evaluation'])

_PERM_READ = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_READ)), DependsRBAC]
_PERM_MANAGE = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_MANAGE)), DependsRBAC]


async def _require_kb_contributor(db: CurrentSessionTransaction, kb_name: str, user: CurrentKbUser, ns: str) -> None:
    """建数据集/跑评估要求对该 KB 有写权限（未达阈值与 KB 不存在同形态 404）。"""
    if await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns) is None:
        raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
    perm = await resolve_kb_perm(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles, kb_name=kb_name)
    if not perm_at_least(perm, Perm.CONTRIBUTE):
        raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')


async def _require_kb_reader(db: CurrentSessionTransaction, kb_name: str, user: CurrentKbUser, ns: str) -> None:
    perm = await resolve_kb_perm(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles, kb_name=kb_name)
    if not perm_at_least(perm, Perm.READ):
        raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')


def _to_detail(obj: object) -> EvalDatasetDetail:
    return EvalDatasetDetail(
        dataset_id=obj.dataset_id,  # type: ignore[attr-defined]
        kb_name=obj.kb_name,  # type: ignore[attr-defined]
        name=obj.name,  # type: ignore[attr-defined]
        description=obj.description or '',  # type: ignore[attr-defined]
        item_count=int(obj.item_count or 0),  # type: ignore[attr-defined]
        has_gold_chunks=bool(obj.has_gold_chunks),  # type: ignore[attr-defined]
        has_gold_answers=bool(obj.has_gold_answers),  # type: ignore[attr-defined]
        build_metadata=dict(obj.build_metadata or {}),  # type: ignore[attr-defined]
        created_by=obj.created_by,  # type: ignore[attr-defined]
        created_time=obj.created_time,  # type: ignore[attr-defined]
    )


@router.post(
    '',
    summary='创建空数据集（题目稍后手工或经生成写入）',
    dependencies=_PERM_MANAGE,
)
async def create_dataset(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
    param: EvalDatasetCreateParam,
) -> ResponseSchemaModel[EvalDatasetDetail]:
    await _require_kb_contributor(db, param.kb_name, user, current_namespace)
    obj = await eval_dataset_dao.create_dataset(
        db,
        dataset_id=str(snowflake.generate()),
        kb_name=param.kb_name,
        name=param.name,
        description=param.description,
        created_by=user.user_id,
        plugin_namespace=current_namespace,
    )
    return response_base.success(data=_to_detail(obj))


@router.post(
    '/generate',
    summary='从 KB 分块生成问答对（LLM，同步完成——分批并发，上限受服务端约束）',
    dependencies=_PERM_MANAGE,
)
async def generate_dataset(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
    param: EvalDatasetGenerateParam,
) -> ResponseSchemaModel[EvalGenerateResult]:
    await _require_kb_contributor(db, param.kb_name, user, current_namespace)
    spec = str(param.model or settings.RAGF_CHAT_MODEL_SPEC or '').strip()
    if not spec:
        raise errors.RequestError(msg='未配置生成模型：请在请求里指定 model，或设置 RAGF_CHAT_MODEL_SPEC')

    from backend.src.app.model_provider.service.provider_service import provider_service

    chat_model = await provider_service.get_chat_model(db, spec)
    target = min(int(param.item_count), int(settings.RAGF_EVAL_GENERATION_MAX_ITEMS))
    items = await generate_items(
        db,
        kb_name=param.kb_name,
        target_count=target,
        sample_size=int(param.sample_size),
        chat_model=chat_model,
        plugin_namespace=current_namespace,
        concurrency=int(settings.RAGF_EVAL_GENERATION_CONCURRENCY),
    )
    if not items:
        raise errors.RequestError(msg='未能生成任何题目：请确认该知识库已有解析完成的分块')

    dataset_id = str(snowflake.generate())
    await eval_dataset_dao.create_dataset(
        db,
        dataset_id=dataset_id,
        kb_name=param.kb_name,
        name=param.name,
        description=param.description,
        created_by=user.user_id,
        plugin_namespace=current_namespace,
    )
    await eval_dataset_dao.replace_items(
        db, dataset_id, kb_name=param.kb_name, items=items, plugin_namespace=current_namespace
    )
    has_answers = any(item.get('gold_answer') for item in items)
    await eval_dataset_dao.mark_built(
        db,
        dataset_id,
        has_gold_chunks=True,
        has_gold_answers=has_answers,
        build_metadata={'source': 'llm_generated', 'model': spec, 'sample_size': int(param.sample_size)},
        plugin_namespace=current_namespace,
    )
    return response_base.success(
        data=EvalGenerateResult(
            dataset_id=dataset_id,
            item_count=len(items),
            has_gold_chunks=True,
            has_gold_answers=has_answers,
        )
    )


@router.get('', summary='数据集列表', dependencies=_PERM_READ)
async def list_datasets(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str | None, Query(description='按知识库过滤')] = None,
    offset: Annotated[int, Query(ge=0, description='偏移')] = 0,
    limit: Annotated[int, Query(ge=1, le=200, description='每页条数')] = 50,
) -> ResponseSchemaModel[list[EvalDatasetDetail]]:
    rows, _total = await eval_dataset_dao.list_datasets(
        db, kb_name=kb_name, plugin_namespace=current_namespace, offset=offset, limit=limit
    )
    return response_base.success(data=[_to_detail(row) for row in rows])


@router.get('/{dataset_id}', summary='数据集详情', dependencies=_PERM_READ)
async def get_dataset(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    dataset_id: Annotated[str, Path(description='数据集 ID')],
) -> ResponseSchemaModel[EvalDatasetDetail]:
    obj = await eval_dataset_dao.get_dataset(db, dataset_id, plugin_namespace=current_namespace)
    if obj is None:
        raise errors.NotFoundError(msg='数据集不存在')
    return response_base.success(data=_to_detail(obj))


@router.get('/{dataset_id}/items', summary='数据集题目列表', dependencies=_PERM_READ)
async def list_dataset_items(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    dataset_id: Annotated[str, Path(description='数据集 ID')],
) -> ResponseSchemaModel[list[EvalDatasetItemDetail]]:
    obj = await eval_dataset_dao.get_dataset(db, dataset_id, plugin_namespace=current_namespace)
    if obj is None:
        raise errors.NotFoundError(msg='数据集不存在')
    rows = await eval_dataset_dao.list_items(db, dataset_id, plugin_namespace=current_namespace)
    return response_base.success(
        data=[
            EvalDatasetItemDetail(
                item_id=row.item_id,
                item_index=int(row.item_index or 0),
                query_text=row.query_text,
                gold_chunk_ids=list(row.gold_chunk_ids or []),
                gold_answer=row.gold_answer,
            )
            for row in rows
        ]
    )


@router.delete('/{dataset_id}', summary='删除数据集', dependencies=_PERM_MANAGE)
async def delete_dataset(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    dataset_id: Annotated[str, Path(description='数据集 ID')],
) -> ResponseSchemaModel[dict]:
    deleted = await eval_dataset_dao.delete_dataset(db, dataset_id, plugin_namespace=current_namespace)
    if not deleted:
        raise errors.NotFoundError(msg='数据集不存在')
    return response_base.success(data={'dataset_id': dataset_id, 'deleted': True})
