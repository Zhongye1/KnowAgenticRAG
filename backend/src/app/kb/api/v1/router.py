from fastapi import APIRouter

from backend.src.app.kb.api.v1.acls import doc_acl_router as doc_acl_router
from backend.src.app.kb.api.v1.acls import kb_acl_router as kb_acl_router
from backend.src.app.kb.api.v1.batch import router as batch_router
from backend.src.app.kb.api.v1.documents import router as documents_router
from backend.src.app.kb.api.v1.export import router as export_router
from backend.src.app.kb.api.v1.knowledge_bases import router as knowledge_bases_router
from backend.src.app.kb.api.v1.preview import router as preview_router
from backend.src.app.kb.api.v1.tags import router as tags_router
from backend.src.core.config import settings

v1 = APIRouter(prefix=settings.FASTAPI_API_V1_PATH)

v1.include_router(knowledge_bases_router, prefix='/knowledge_bases', tags=['知识库'])
v1.include_router(kb_acl_router, prefix='/knowledge_bases', tags=['知识库权限'])
# batch 必须先于 documents：否则 DELETE /documents/batch 会被 /{document_id} 吃掉
v1.include_router(batch_router, prefix='/documents', tags=['知识库文档批量'])
v1.include_router(documents_router, prefix='/documents', tags=['知识库文档'])
v1.include_router(preview_router, prefix='/documents', tags=['知识库文档预览'])
v1.include_router(export_router, prefix='/knowledge_bases', tags=['知识库导出'])
v1.include_router(doc_acl_router, prefix='/documents', tags=['知识库文档权限'])
v1.include_router(tags_router, prefix='/tags', tags=['知识库标签'])
