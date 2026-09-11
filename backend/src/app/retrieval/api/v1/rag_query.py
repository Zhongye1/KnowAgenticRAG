"""RAG 查询面 API(EagleRAG 对齐:扁平跨库检索 + sources 二元来源 + steps 轨迹)。

`POST /api/v1/rag/search` 为检索的 canonical REST 端点(取代旧
`/knowledge_bases/{kb_name}/search`,前端 generated 未消费,无兼容包袱);
`GET /api/v1/rag/images/{image_id}/url` 提供视觉 tile 预签名回源(与文档下载
同模式:RBAC + namespace 隔离 + presign)。scope 仍由服务端构建,客户端不可传
过滤语义。
"""

import asyncio

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Path

from backend.src.app.kb.crud import document_dao
from backend.src.app.kb.deps import CurrentNamespace, CurrentScope
from backend.src.app.kb.service.document_storage import get_document_url
from backend.src.app.kb.utils.permissions import RAG_KB_READ, RAG_KB_SEARCH
from backend.src.app.retrieval.schema.rag_query import ImageUrlData, RagSearchOutput, RagSearchParam
from backend.src.app.retrieval.service.rag_adapter import build_rag_payload
from backend.src.app.retrieval.service.retrieval_service import retrieval_service
from backend.src.common.exception import errors
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.common.security.permission import RequestPermission
from backend.src.common.security.rbac import DependsRBAC
from backend.src.database.db import CurrentSession
from backend.src.database.milvus_visual_ops import get_visual_image_ref

# fba 鉴权顺序约束：RequestPermission 先于 DependsRBAC（先设 ctx.permission 再校验）
search_router = APIRouter(dependencies=[DependsJwtAuth, Depends(RequestPermission(RAG_KB_SEARCH)), DependsRBAC])
images_router = APIRouter(dependencies=[DependsJwtAuth, Depends(RequestPermission(RAG_KB_READ)), DependsRBAC])

# 预签名有效期（秒），与文档下载默认一致
_IMAGE_URL_EXPIRES = 3600


@search_router.post('/search', summary='RAG 跨库检索（sources 二元来源 + steps 轨迹）')
async def rag_search(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    scope: CurrentScope,
    obj: RagSearchParam,
) -> ResponseSchemaModel[RagSearchOutput]:
    data = await retrieval_service.search_multi(
        db,
        kb_names=obj.kb_names,
        query_text=obj.query_text,
        param=obj,
        plugin_namespace=current_namespace,
        scope=scope,
    )
    payload = build_rag_payload(data)
    return cast(
        'ResponseSchemaModel[RagSearchOutput]', response_base.success(data=RagSearchOutput.model_validate(payload))
    )


@images_router.get('/images/{image_id}/url', summary='视觉 tile 预签名 URL（对象键 → 短期直链）')
async def get_rag_image_url(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    image_id: Annotated[str, Path(description='视觉行 ID（{document_id}_t{序号}）', max_length=255)],
) -> ResponseSchemaModel[ImageUrlData]:
    ref = await asyncio.to_thread(get_visual_image_ref, image_id, plugin_namespace=current_namespace)
    if ref is None:
        raise errors.NotFoundError(msg='视觉图像不存在')
    # 文档存在性校验（PG 事实源；kb_name 归属随行返回，防跨库对象键伪造）
    doc = await document_dao.get(db, ref['document_id'], kb_name=ref['kb_name'], plugin_namespace=current_namespace)
    if doc is None:
        raise errors.NotFoundError(msg='视觉图像不存在')
    url = get_document_url(ref['image_path'], expires=_IMAGE_URL_EXPIRES)
    data = ImageUrlData(
        image_id=image_id,
        document_id=ref['document_id'],
        kb_name=ref['kb_name'],
        url=url,
        expires_in_seconds=_IMAGE_URL_EXPIRES,
    )
    return cast('ResponseSchemaModel[ImageUrlData]', response_base.success(data=data))
