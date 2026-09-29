"""PG 测试库 schema 助手（kb 域 PG 集成测试共用）。

**为什么重建而不是逐列 `ADD COLUMN IF NOT EXISTS`**：项目未上线、schema 由启动时
`create_all` 负责，而 `create_all` **只建缺失的表、不给既有表补列**。于是每加一列
（`documents.preview_kind`、`knowledge_bases.sample_questions`…）
所有 PG 测试就会同时红，而逐个补 ALTER 是一份**必然滞后**的重复清单。测试库没有
需要保留的数据，按模型重建即永远与模型一致。

**为什么只重建 kb 域的表**：`Base` 继承自 `MappedBase`（`common/model.py:118,150`），
两者**共享同一个 metadata**，所以 `MappedBase.metadata.drop_all` 会连 admin 域的
`sys_user` 一起删——而 `conftest.client / token_headers` 依赖 `admin` / `123456` 登录。
更麻烦的是文件名顺序（`admin` 在前、`kb` 在后），破坏**要到下一轮运行才暴露**。
因此这里只 drop kb 域模型声明的表，其他域的表一概不碰。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.core.config import settings
from backend.src.database.db import MappedBase

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

__all__ = ['ensure_test_database', 'kb_owned_tables', 'reset_test_schema', 'test_database_name']


def test_database_name() -> str:
    """测试库名（形如 ``ragf_test``）。"""
    return f'{settings.DATABASE_SCHEMA}_test'


def kb_owned_tables() -> list[str]:
    """kb 域模型实际声明的表名（从 model 包动态取，新增模型无需改这里）。"""
    import backend.src.app.kb.model as kb_models

    names: set[str] = set()
    for attr in vars(kb_models).values():
        table = getattr(attr, '__table__', None)
        if table is not None:
            names.add(str(table.name))
    return sorted(names)


async def ensure_test_database() -> None:
    """幂等：确保测试库存在（连 postgres 库创建）。"""
    import asyncpg

    conn = await asyncpg.connect(
        host=settings.DATABASE_HOST,
        port=settings.DATABASE_PORT,
        user=settings.DATABASE_USER,
        password=settings.DATABASE_PASSWORD,
        database='postgres',
        timeout=3,
    )
    try:
        name = test_database_name()
        exists = await conn.fetchval('SELECT 1 FROM pg_database WHERE datname = $1', name)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


async def reset_test_schema(engine: AsyncEngine) -> None:
    """重建 **kb 域** 全部业务表（其他域的表不动），再 `create_all` 补齐缺失表。

    `drop_all(tables=...)` 只处理给定表并按外键依赖自动排序；`create_all` 随后
    幂等补齐（含本次新增的表），其他域已存在的表不受影响。
    """
    owned = set(kb_owned_tables())
    tables = [table for table in MappedBase.metadata.sorted_tables if table.name in owned]

    def _drop(sync_conn: Any) -> None:
        MappedBase.metadata.drop_all(sync_conn, tables=tables)

    async with engine.begin() as conn:
        await conn.run_sync(_drop)
        await conn.run_sync(MappedBase.metadata.create_all)
