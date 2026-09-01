"""文档上传/下载服务（对象存储 + 元数据登记，不含 RAG 摄取）。"""

from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import dedup_dao, document_dao, keyword_dao, knowledge_base_dao
from backend.src.app.kb.crud.crud_dedup import compute_sha256_bytes
from backend.src.app.kb.model import Document
from backend.src.app.kb.schema.document import DocumentUpdateParam
from backend.src.app.kb.service.document_storage import (
    delete_document_object,
    get_document_url,
    kb_object_key,
    upload_document_bytes,
)
from backend.src.app.kb.service.namespace import instance_namespace
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.database.milvus_kb_ops import base_collection_names, delete_vectors_by_document


class DocumentService:
    """文档对象存储与登记业务逻辑（与 RAG 摄取/嵌入解耦）。"""

    @staticmethod
    async def upload(
        *,
        db: AsyncSession,
        kb_name: str,
        file: UploadFile,
        source_type: str = 'file',
    ) -> Document:
        """上传文件到对象存储并登记文档元数据（status=pending，等待摄取层接管）。"""
        kb = await knowledge_base_dao.get(db, kb_name)
        if kb is None:
            raise errors.NotFoundError(msg='知识库不存在')

        filename = (file.filename or 'file').strip() or 'file'
        data = await file.read()
        if not data:
            raise errors.RequestError(msg='文件内容为空')

        sha256 = compute_sha256_bytes(data)
        if await dedup_dao.check_duplicate(db, sha256, kb_name):
            raise errors.ConflictError(msg='该文件已存在于知识库中')

        document_id = uuid4().hex
        object_key = kb_object_key(instance_namespace(), kb_name, document_id, filename)
        try:
            await upload_document_bytes(object_key, data, content_type=file.content_type or 'application/octet-stream')
        except Exception as exc:
            log.error('文档上传对象存储失败 kb={}: {}', kb_name, exc)
            raise errors.RequestError(msg='对象存储上传失败') from exc

        try:
            doc = await document_dao.create(
                db,
                document_id=document_id,
                kb_name=kb_name,
                name=filename,
                source_type=source_type,
                source_uri=object_key,
                sha256=sha256,
            )
            await dedup_dao.register(
                db,
                sha256=sha256,
                kb_name=kb_name,
                document_id=document_id,
                object_key=object_key,
                source_name=filename,
            )
        except Exception:
            await delete_document_object(object_key)
            raise
        return doc

    @staticmethod
    async def get_download_url(*, db: AsyncSession, document_id: str) -> str:
        """生成文档对象存储预签名下载 URL。"""
        doc = await document_dao.get(db, document_id)
        if doc is None:
            raise errors.NotFoundError(msg='文档不存在')
        if not doc.source_uri:
            raise errors.RequestError(msg='文档未存储在对象存储中')
        return get_document_url(doc.source_uri)

    @staticmethod
    async def update(*, db: AsyncSession, document_id: str, obj: DocumentUpdateParam) -> Document:
        """更新文档元数据（名称/来源类型/管道/状态）。"""
        doc = await document_dao.get(db, document_id)
        if doc is None:
            raise errors.NotFoundError(msg='文档不存在')
        updates = obj.model_dump(exclude_unset=True)
        if not updates:
            return doc
        for field, value in updates.items():
            setattr(doc, field, value)
        await db.flush()
        return doc

    @staticmethod
    async def replace_file(
        *,
        db: AsyncSession,
        document_id: str,
        file: UploadFile,
    ) -> Document:
        """替换文档文件：重新上传 OSS 并刷新指纹/去重记录，状态回到 pending。"""
        doc = await document_dao.get(db, document_id)
        if doc is None:
            raise errors.NotFoundError(msg='文档不存在')

        filename = (file.filename or doc.name or 'file').strip() or 'file'
        data = await file.read()
        if not data:
            raise errors.RequestError(msg='文件内容为空')

        sha256 = compute_sha256_bytes(data)
        existing = await dedup_dao.get_by_sha256(db, sha256, kb_name=doc.kb_name)
        if existing is not None and existing.document_id != document_id:
            raise errors.ConflictError(msg='该文件已存在于知识库中')

        old_key = doc.source_uri
        object_key = kb_object_key(instance_namespace(), doc.kb_name, document_id, filename)
        try:
            await upload_document_bytes(object_key, data, content_type=file.content_type or 'application/octet-stream')
        except Exception as exc:
            log.error('文档替换上传对象存储失败 doc={}: {}', document_id, exc)
            raise errors.RequestError(msg='对象存储上传失败') from exc

        try:
            await dedup_dao.delete_by_document(db, document_id)
            await dedup_dao.register(
                db,
                sha256=sha256,
                kb_name=doc.kb_name,
                document_id=document_id,
                object_key=object_key,
                source_name=filename,
            )
            doc.name = filename
            doc.sha256 = sha256
            doc.source_uri = object_key
            doc.status = 'pending'
            await db.flush()
        except Exception:
            await delete_document_object(object_key)
            raise

        if old_key and old_key != object_key:
            await delete_document_object(old_key)
        return doc

    @staticmethod
    async def delete(*, db: AsyncSession, document_id: str) -> dict[str, int]:
        """删除单篇文档：向量（按 document_id）→ 对象存储 → keywords → dedup → 登记行。"""
        doc = await document_dao.get(db, document_id)
        if doc is None:
            raise errors.NotFoundError(msg='文档不存在')
        ns = instance_namespace()

        counts: dict[str, int] = {
            'milvus_text': 0,
            'milvus_visual': 0,
            'documents': 0,
            'dedup': 0,
            'keywords': 0,
            'objects': 0,
        }
        text_coll, visual_coll = base_collection_names()
        counts['milvus_text'] = delete_vectors_by_document(text_coll, doc.kb_name, document_id, plugin_namespace=ns)
        counts['milvus_visual'] = delete_vectors_by_document(visual_coll, doc.kb_name, document_id, plugin_namespace=ns)

        if doc.source_uri:
            await delete_document_object(doc.source_uri)
            counts['objects'] = 1

        counts['keywords'] = await keyword_dao.delete_by_document(db, document_id, plugin_namespace=ns)
        counts['dedup'] = await dedup_dao.delete_by_document(db, document_id, plugin_namespace=ns)
        counts['documents'] = await document_dao.delete(db, document_id, plugin_namespace=ns)
        return counts


document_service = DocumentService()
