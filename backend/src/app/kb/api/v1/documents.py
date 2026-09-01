"""文档只读 API（元数据登记，不含摄取）。"""

from typing import Annotated, cast

from fastapi import APIRouter, Path, Query

from backend.src.app.kb.crud import document_dao
from backend.src.app.kb.deps import CurrentNamespace
from backend.src.app.kb.model import Document
from backend.src.app.kb.schema.document import DocumentItem
from backend.src.common.exception import errors
from backend.src.common.pagination import DependsPagination, PageData, paging_data
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.database.db import CurrentSession

router = APIRouter()


def _doc_to_dict(doc: Document) -> dict:
    return {
        'document_id': doc.document_id,
        'kb_name': doc.kb_name,
        'plugin_namespace': doc.plugin_namespace,
        'name': doc.name,
        'source_type': doc.source_type,
        'source_uri': doc.source_uri,
        'pipeline': doc.pipeline,
        'status': doc.status,
        'sha256': doc.sha256,
        'chunk_count': doc.chunk_count,
        'created_time': doc.created_time,
        'updated_time': doc.updated_time,
    }


@router.get('/documents', summary='文档列表', dependencies=[DependsJwtAuth, DependsPagination])
async def get_documents(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    kb_name: Annotated[str | None, Query(description='知识库标识')] = None,
    query: Annotated[str | None, Query(description='搜索关键词')] = None,
    source_type: Annotated[str | None, Query(description='来源类型')] = None,
    status: Annotated[str | None, Query(description='状态')] = None,
) -> ResponseSchemaModel[PageData[DocumentItem]]:
    stmt = await document_dao.get_select(
        kb_name=kb_name,
        query=query,
        source_type=source_type,
        status=status,
    )
    data = await paging_data(db, stmt)
    data['items'] = [DocumentItem.model_validate(_doc_to_dict(item)) for item in data['items']]
    return cast('ResponseSchemaModel[PageData[DocumentItem]]', response_base.success(data=data))


@router.get('/documents/{document_id}', summary='文档详情', dependencies=[DependsJwtAuth])
async def get_document(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    document_id: Annotated[str, Path(description='文档 ID')],
) -> ResponseSchemaModel[DocumentItem]:
    doc = await document_dao.get(db, document_id)
    if doc is None:
        raise errors.NotFoundError(msg='文档不存在')
    return response_base.success(data=DocumentItem.model_validate(_doc_to_dict(doc)))
