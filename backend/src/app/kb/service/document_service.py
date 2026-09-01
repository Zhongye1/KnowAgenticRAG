"""文档上传/下载服务（对象存储 + 元数据登记，不含 RAG 摄取）。"""

from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import dedup_dao, document_dao, knowledge_base_dao
from backend.src.app.kb.crud.crud_dedup import compute_sha256_bytes
from backend.src.app.kb.model import Document
from backend.src.app.kb.service.document_storage import (
    delete_document_object,
    get_document_url,
    kb_object_key,
    upload_document_bytes,
)
from backend.src.app.kb.service.namespace import instance_namespace
from backend.src.common.exception import errors
from backend.src.common.log import log


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


document_service = DocumentService()
