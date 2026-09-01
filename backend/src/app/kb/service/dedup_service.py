"""文档去重服务（供未来 RAG 摄取层调用）。"""

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import dedup_dao
from backend.src.app.kb.crud.crud_dedup import compute_sha256_bytes


class DedupService:
    """文档去重业务逻辑。"""

    @staticmethod
    def sha256(data: bytes) -> str:
        """计算文件指纹。"""
        return compute_sha256_bytes(data)

    @staticmethod
    async def check_duplicate(
        *,
        db: AsyncSession,
        sha256: str,
        kb_name: str,
        plugin_namespace: str | None = None,
    ) -> bool:
        """判断文件是否已在知识库内注册。"""
        return await dedup_dao.check_duplicate(db, sha256, kb_name, plugin_namespace=plugin_namespace)

    @staticmethod
    async def register(
        *,
        db: AsyncSession,
        sha256: str,
        kb_name: str,
        document_id: str,
        object_key: str | None = None,
        source_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> bool:
        """注册去重记录。"""
        return await dedup_dao.register(
            db,
            sha256=sha256,
            kb_name=kb_name,
            document_id=document_id,
            object_key=object_key,
            source_name=source_name,
            plugin_namespace=plugin_namespace,
        )


dedup_service = DedupService()
