"""图谱接口（RAG 清单 Phase 5 / D62）。

权限沿用既有码（``RAG_KB_MANAGE`` 写 / ``RAG_KB_READ`` 读）而不新造 ``rag:kb:graph``：
新权限码需要同步 ``sys_menu`` seed，否则没有任何角色持有它、路由整体 403（与评估域同一
取舍）。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from backend.src.app.graph.crud import graph_dao
from backend.src.app.graph.schema.graph import (
    GraphBuildAccepted,
    GraphBuildParam,
    GraphDeleteResult,
    GraphStatsDetail,
    GraphSubgraphDetail,
)
from backend.src.app.graph.service.graph_service import build_subgraph
from backend.src.app.graph.service.retriever import locate_seed_entities
from backend.src.app.kb.crud import document_dao, knowledge_base_dao
from backend.src.app.kb.deps import CurrentKbUser, CurrentNamespace
from backend.src.app.kb.service.acl.resolver import Perm, perm_at_least, resolve_kb_perm
from backend.src.app.kb.utils.permissions import RAG_KB_MANAGE, RAG_KB_READ
from backend.src.common.exception import errors
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import CurrentSessionTransaction

router = APIRouter(prefix='/graph', tags=['graph'])

_PERM_READ = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_READ)), DependsRBAC]
_PERM_MANAGE = [DependsJwtAuth, Depends(RequestPermission(RAG_KB_MANAGE)), DependsRBAC]


async def _require_kb_perm(
    db: CurrentSessionTransaction, kb_name: str, user: CurrentKbUser, ns: str, threshold: Perm
) -> None:
    """资源级权限断言（未达阈值与 KB 不存在同形态 404，不泄露存在性）。"""
    if await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns) is None:
        raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
    perm = await resolve_kb_perm(db, user_id=user.user_id, dept_id=user.dept_id, roles=user.roles, kb_name=kb_name)
    if not perm_at_least(perm, threshold):
        raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')


def _enqueue_build(document_id: str, kb_name: str, ns: str, extractor_spec: str) -> None:
    from backend.src.app.task.celery import celery_app

    celery_app.send_task(
        'graph.build_document',
        kwargs={
            'document_id': document_id,
            'kb_name': kb_name,
            'plugin_namespace': ns,
            'extractor_spec': extractor_spec,
        },
    )


@router.post('/{kb_name}/documents/build', summary='触发单篇文档建图（异步）', dependencies=_PERM_MANAGE)
async def build_document_graph(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
    kb_name: Annotated[str, Path(description='知识库标识', pattern=r'^[a-z0-9_]+$')],
    param: GraphBuildParam,
) -> ResponseSchemaModel[GraphBuildAccepted]:
    await _require_kb_perm(db, kb_name, user, current_namespace, Perm.CONTRIBUTE)
    doc = await document_dao.get(db, param.document_id, kb_name=kb_name, plugin_namespace=current_namespace)
    if doc is None:
        raise errors.NotFoundError(msg='文档不存在')
    if doc.status != 'ready':
        raise errors.RequestError(msg=f'文档尚未完成摄取（当前 {doc.status}），无法建图')
    _enqueue_build(doc.document_id, kb_name, current_namespace, param.extractor_spec)
    return response_base.success(data=GraphBuildAccepted(document_id=doc.document_id, queued=True))


@router.get('/{kb_name}/stats', summary='图谱规模统计', dependencies=_PERM_READ)
async def graph_stats(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
    kb_name: Annotated[str, Path(description='知识库标识')],
) -> ResponseSchemaModel[GraphStatsDetail]:
    await _require_kb_perm(db, kb_name, user, current_namespace, Perm.READ)
    counts = await graph_dao.stats(db, kb_name, plugin_namespace=current_namespace)
    return response_base.success(data=GraphStatsDetail(kb_name=kb_name, **counts))


@router.get('/{kb_name}/subgraph', summary='按查询投影子图（可视化与排查用）', dependencies=_PERM_READ)
async def graph_subgraph(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
    kb_name: Annotated[str, Path(description='知识库标识')],
    query: Annotated[str, Query(min_length=1, max_length=500, description='查询文本（用于定位种子实体）')],
    hops: Annotated[int, Query(ge=0, le=2, description='扩展跳数')] = 2,
) -> ResponseSchemaModel[GraphSubgraphDetail]:
    await _require_kb_perm(db, kb_name, user, current_namespace, Perm.READ)
    seeds = await locate_seed_entities(db, query_text=query, kb_name=kb_name, plugin_namespace=current_namespace)
    subgraph = (
        await build_subgraph(
            db,
            kb_name=kb_name,
            seed_entity_ids=[seed.entity_id for seed in seeds],
            hops=hops,
            plugin_namespace=current_namespace,
        )
        if seeds
        else {'nodes': [], 'edges': []}
    )
    return response_base.success(
        data=GraphSubgraphDetail(
            kb_name=kb_name,
            seed_entity_ids=[seed.entity_id for seed in seeds],
            nodes=subgraph['nodes'],
            edges=subgraph['edges'],
        )
    )


@router.delete('/{kb_name}', summary='删除知识库图谱（四张表全清）', dependencies=_PERM_MANAGE)
async def delete_graph(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    user: CurrentKbUser,
    kb_name: Annotated[str, Path(description='知识库标识')],
) -> ResponseSchemaModel[GraphDeleteResult]:
    await _require_kb_perm(db, kb_name, user, current_namespace, Perm.CONTRIBUTE)
    deleted = await graph_dao.delete_kb_graph(db, kb_name, plugin_namespace=current_namespace)
    return response_base.success(data=GraphDeleteResult(kb_name=kb_name, deleted=deleted))
