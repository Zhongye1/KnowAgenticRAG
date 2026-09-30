"""RAGF 演进幂等 DDL（ragf-design §6.2/§6.4）。

dev 环境表由 ``MappedBase.metadata.create_all`` 创建，但该路径不会给**已存在**的
表补列；这里对 kb 域既有表做 ``ADD COLUMN IF NOT EXISTS`` 补充，启动时幂等执行。
正式 alembic 迁移在治理批次统一引入（见 ragf-design §10/§18）。

注意：kb-ownership-and-acl-v2 spec 对 ``rag_kb_acl``/``rag_doc_acl`` 做了破坏性
重构（group_id → principal_type/principal_id，pre-launch 无存量数据），本文件不
做 ACL 表改形迁移——已存在的 v1 表需手动 DROP，由 create_all 按 v2 形态重建。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import text

from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.db import async_engine

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

# (表, 列, 列定义)；仅 PostgreSQL（当前 DATABASE_TYPE）
_RAGF_ADD_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ('knowledge_bases', 'query_params', "JSON DEFAULT '{}'::json NOT NULL"),
    ('documents', 'ingest_params', "JSON DEFAULT '{}'::json NOT NULL"),
    ('documents', 'error_message', 'TEXT'),
    # ACL 列（agent-layer spec RAG 数据权限设计；rag_kb_acl/rag_doc_acl 为新表，create_all 直建）
    ('documents', 'visibility', "VARCHAR(16) DEFAULT 'restricted' NOT NULL"),
    ('documents', 'owner_id', 'VARCHAR(64)'),
    # KB 归属与公开开关（kb-ownership-and-acl-v2 spec §4.1）
    ('knowledge_bases', 'owner_id', 'VARCHAR(64)'),
    ('knowledge_bases', 'is_public', 'BOOLEAN DEFAULT FALSE NOT NULL'),
    # 双管线摄取（spec D2/D6）：路由模式 + Knowhere 产物列
    ('knowledge_bases', 'routing_mode', "VARCHAR(16) DEFAULT 'auto' NOT NULL"),
    ('documents', 'summary', 'TEXT'),
    ('documents', 'structure', 'JSON'),
    # Agent 运行态（agent 层设计 D87–D92）：agent_runs 由「终态审计」升级为「Run 状态机」，
    # 新增租约/归属/父子关系列。表已存在，create_all 不会补列，故必须在此显式 ADD COLUMN。
    ('agent_runs', 'worker_id', 'TEXT'),
    ('agent_runs', 'heartbeat_at', 'TIMESTAMP WITH TIME ZONE'),
    ('agent_runs', 'lease_expires_at', 'TIMESTAMP WITH TIME ZONE'),
    ('agent_runs', 'parent_run_id', 'TEXT'),
    ('agent_runs', 'output_message_id', 'TEXT'),
    ('agent_runs', 'error', 'TEXT'),
    ('agent_runs', 'updated_time', 'TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL'),
    # Run 迁入 worker 后「提交进程」与「执行进程」不是同一个：执行所需的一切必须落行。
    # payload = 提交快照（kb_name/param/用户上下文）；result = 终态产物快照（非流式响应与
    # GET /runs/{id} 的数据源，取消时是已收集部分的合成结果，D92）；error_code = 机器码。
    ('agent_runs', 'payload', "JSON DEFAULT '{}'::json NOT NULL"),
    ('agent_runs', 'result', "JSON DEFAULT '{}'::json NOT NULL"),
    ('agent_runs', 'error_code', 'TEXT'),
)


async def ensure_ragf_column_migrations(engine: AsyncEngine | None = None) -> None:
    """为已存在的旧表补充 RAGF 新增列（幂等）。

    :param engine: 目标引擎；缺省用全局 ``async_engine``（生产启动路径
        ``core/register.py`` 即如此调用）。**测试必须显式传入自己的引擎**——
    单测连的是 ``{schema}_test`` 库，缺省参数会把列补到主库上，
    于是用例仍以 ``UndefinedColumnError`` 失败。
    """
    if settings.DATABASE_TYPE != 'postgresql':
        log.warning('[ragf-schema] 当前非 PostgreSQL，跳过幂等 DDL 补充')
        return
    target = engine if engine is not None else async_engine
    async with target.begin() as conn:
        for table, column, definition in _RAGF_ADD_COLUMNS:
            await conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{column}" {definition}'))
    log.info('[ragf-schema] 幂等 DDL 补充完成（kb 域演进列）')
