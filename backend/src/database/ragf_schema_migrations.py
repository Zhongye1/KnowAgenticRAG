"""RAGF 演进幂等 DDL（ragf-design §6.2/§6.4）。

dev 环境表由 ``MappedBase.metadata.create_all`` 创建，但该路径不会给**已存在**的
表补列；这里对 kb 域既有表做 ``ADD COLUMN IF NOT EXISTS`` 补充，启动时幂等执行。
正式 alembic 迁移在治理批次统一引入（见 ragf-design §10/§18）。
"""

from __future__ import annotations

from sqlalchemy import text

from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.db import async_engine

# (表, 列, 列定义)；仅 PostgreSQL（当前 DATABASE_TYPE）
_RAGF_ADD_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ('knowledge_bases', 'query_params', "JSON DEFAULT '{}'::json NOT NULL"),
    ('documents', 'ingest_params', "JSON DEFAULT '{}'::json NOT NULL"),
    ('documents', 'error_message', 'TEXT'),
    # ACL 列（agent-layer spec RAG 数据权限设计；rag_kb_acl/rag_doc_acl 为新表，create_all 直建）
    ('documents', 'visibility', "VARCHAR(16) DEFAULT 'restricted' NOT NULL"),
    ('documents', 'owner_id', 'VARCHAR(64)'),
    # 双管线摄取（spec D2/D6）：路由模式 + Knowhere 产物列
    ('knowledge_bases', 'routing_mode', "VARCHAR(16) DEFAULT 'legacy' NOT NULL"),
    ('documents', 'summary', 'TEXT'),
    ('documents', 'structure', 'JSON'),
)


async def ensure_ragf_column_migrations() -> None:
    """为已存在的旧表补充 RAGF 新增列（幂等）。"""
    if settings.DATABASE_TYPE != 'postgresql':
        log.warning('[ragf-schema] 当前非 PostgreSQL，跳过幂等 DDL 补充')
        return
    async with async_engine.begin() as conn:
        for table, column, definition in _RAGF_ADD_COLUMNS:
            await conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{column}" {definition}'))
    log.info('[ragf-schema] 幂等 DDL 补充完成（kb 域演进列）')
