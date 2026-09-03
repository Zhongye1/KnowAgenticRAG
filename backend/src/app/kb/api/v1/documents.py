"""文档只读 API（元数据登记，不含摄取）。"""

from typing import Annotated, cast

from fastapi import APIRouter, File, Form, Path, Query, UploadFile

from backend.src.app.kb.crud import chunk_dao, document_dao
from backend.src.app.kb.deps import CurrentNamespace
from backend.src.app.kb.model import Document
from backend.src.app.kb.schema.chunk import ChunkItem
from backend.src.app.kb.schema.document import DocumentItem, DocumentUpdateParam
from backend.src.app.kb.service.document_service import document_service
from backend.src.common.exception import errors
from backend.src.common.pagination import DependsPagination, PageData, paging_data
from backend.src.common.response.response_schema import ResponseSchemaModel, response_base
from backend.src.common.security.jwt import DependsJwtAuth
from backend.src.database.db import CurrentSession, CurrentSessionTransaction

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
        'active_version': doc.active_version,
        'ingest_params': doc.ingest_params or {},
        'error_message': doc.error_message,
        'created_time': doc.created_time,
        'updated_time': doc.updated_time,
    }


@router.get(
    '/{document_id}/chunks',
    summary='文档分块浏览（只读，来源调试/评估）',
    dependencies=[DependsJwtAuth, DependsPagination],
)
async def get_document_chunks(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    document_id: Annotated[str, Path(description='文档 ID')],
    version: Annotated[int | None, Query(description='版本（缺省 = 当前 active_version）')] = None,
) -> ResponseSchemaModel[PageData[ChunkItem]]:
    doc = await document_dao.get(db, document_id)
    if doc is None:
        raise errors.NotFoundError(msg='文档不存在')
    stmt = await chunk_dao.get_page_select(
        document_id=document_id,
        kb_name=doc.kb_name,
        version_id=version if version is not None else doc.active_version,
    )
    data = await paging_data(db, stmt)
    data['items'] = [ChunkItem.model_validate(item) for item in data['items']]
    return cast('ResponseSchemaModel[PageData[ChunkItem]]', response_base.success(data=data))


@router.post('', summary='上传文档（存入对象存储）', dependencies=[DependsJwtAuth])
async def upload_document(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    file: Annotated[UploadFile, File(description='文档文件')],
    kb_name: Annotated[str, Form(description='知识库标识')],
    source_type: Annotated[str, Form(description='来源类型')] = 'file',
) -> ResponseSchemaModel[DocumentItem]:
    doc = await document_service.upload(db=db, kb_name=kb_name, file=file, source_type=source_type)
    return response_base.success(data=DocumentItem.model_validate(_doc_to_dict(doc)))


@router.get('', summary='文档列表', dependencies=[DependsJwtAuth, DependsPagination])
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


@router.get('/{document_id}/download', summary='文档下载链接（对象存储预签名 URL）', dependencies=[DependsJwtAuth])
async def get_document_download(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    document_id: Annotated[str, Path(description='文档 ID')],
) -> ResponseSchemaModel[dict[str, str]]:
    url = await document_service.get_download_url(db=db, document_id=document_id)
    return response_base.success(data={'url': url})


@router.put('/{document_id}/file', summary='替换文档文件（重新上传 OSS）', dependencies=[DependsJwtAuth])
async def replace_document_file(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    document_id: Annotated[str, Path(description='文档 ID')],
    file: Annotated[UploadFile, File(description='新的文档文件')],
) -> ResponseSchemaModel[DocumentItem]:
    doc = await document_service.replace_file(db=db, document_id=document_id, file=file)
    return response_base.success(data=DocumentItem.model_validate(_doc_to_dict(doc)))


@router.patch('/{document_id}', summary='更新文档元数据', dependencies=[DependsJwtAuth])
async def update_document(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    document_id: Annotated[str, Path(description='文档 ID')],
    obj: DocumentUpdateParam,
) -> ResponseSchemaModel[DocumentItem]:
    doc = await document_service.update(db=db, document_id=document_id, obj=obj)
    return response_base.success(data=DocumentItem.model_validate(_doc_to_dict(doc)))


@router.delete('/{document_id}', summary='删除文档（级联清理向量/OSS/登记）', dependencies=[DependsJwtAuth])
async def delete_document(
    db: CurrentSessionTransaction,
    current_namespace: CurrentNamespace,
    document_id: Annotated[str, Path(description='文档 ID')],
) -> ResponseSchemaModel[dict[str, int]]:
    counts = await document_service.delete(db=db, document_id=document_id)
    return response_base.success(data=counts)


@router.get('/{document_id}', summary='文档详情', dependencies=[DependsJwtAuth])
async def get_document(
    db: CurrentSession,
    current_namespace: CurrentNamespace,
    document_id: Annotated[str, Path(description='文档 ID')],
) -> ResponseSchemaModel[DocumentItem]:
    doc = await document_dao.get(db, document_id)
    if doc is None:
        raise errors.NotFoundError(msg='文档不存在')
    return response_base.success(data=DocumentItem.model_validate(_doc_to_dict(doc)))
