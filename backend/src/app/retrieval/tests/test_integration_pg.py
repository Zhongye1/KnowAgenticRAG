"""M11 检索 filters 的真实 PostgreSQL 集成测试（agent-layer spec §7 验收）。

验证文档级过滤（keyword/tag/updated/file_type/path_prefix + file_name）与租户/KB
作用域强制注入在真实 PG 上正确：命中集、空集短路（[]）、无条件返回 None、跨租户
同 KB 数据不可见。每用例在独立事务内播种并在退出时回滚，不留数据残留；DB 不可达
时整模块跳过（docker compose 未启动的本地环境不失败）。

说明：version_id 过滤作用于 Milvus 表达式层（compose_retrieval_expr 单测覆盖），
本测试只覆盖 PG 侧的 document_id 解析；真实 PG+Milvus 端到端检索需先经 ingest
播种向量数据（当前 dev 环境 Milvus 集合为空）。
"""

from __future__ import annotations

import asyncio

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import pytest

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.src.app.kb.crud.crud_document import document_dao
from backend.src.app.kb.model.document import Document
from backend.src.app.kb.model.document_keyword import DocumentKeyword
from backend.src.core.config import settings
from backend.src.database.db import MappedBase, get_database_url

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

NS_CORE = 'core'
NS_ACME = 'acme'
KB_DEV = 'dev'


def _utc(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=UTC)


async def _ensure_test_db() -> None:
    """幂等：确保 ragf_test 库存在（postgres 超管连接，dev 环境 DATABASE_USER=postgres）。"""
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
        name = f'{settings.DATABASE_SCHEMA}_test'
        exists = await conn.fetchval('SELECT 1 FROM pg_database WHERE datname = $1', name)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


@pytest.fixture(scope='module', autouse=True)
def _pg_integration_env() -> Any:
    """跳过条件 + 命名空间开关：DB 不可达则整模块 skip。"""
    try:
        asyncio.run(_ensure_test_db())
    except Exception as exc:  # pragma: no cover - 本地环境相关
        pytest.skip(f'真实 PG 不可达，跳过集成测试: {exc}')
    import backend.src.app.kb.model.document  # ruff: ignore[unused-import]  确保模型注册到 MappedBase.metadata
    import backend.src.app.kb.model.document_keyword  # ruff: ignore[unused-import]
    import backend.src.app.kb.model.knowledge_base  # ruff: ignore[unused-import]

    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    asyncio.run(_create_all(engine))
    asyncio.run(engine.dispose())
    prev_override = settings.ALLOW_NAMESPACE_OVERRIDE
    settings.ALLOW_NAMESPACE_OVERRIDE = True  # 集成用例需显式跨租户（acme）
    yield
    settings.ALLOW_NAMESPACE_OVERRIDE = prev_override


async def _create_all(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(MappedBase.metadata.create_all)


async def _seed(session: AsyncSession) -> dict[str, str]:
    """在事务内播种两租户同 KB 名文档（不回滚前仅本事务可见）。"""
    ids = {
        'd1': 'pgtest-d1-install-md',
        'd2': 'pgtest-d2-version-md',
        'd3': 'pgtest-d3-api-pdf',
        'd4': 'pgtest-d4-acme-install-md',
    }
    docs = [
        Document(
            document_id=ids['d1'],
            kb_name=KB_DEV,
            plugin_namespace=NS_CORE,
            name='install-guide.md',
            source_type='upload',
            source_uri='docs/guide/install.md',
            status='ready',
            active_version=2,
            updated_time=_utc('2024-01-15T00:00:00+00:00'),
        ),
        Document(
            document_id=ids['d2'],
            kb_name=KB_DEV,
            plugin_namespace=NS_CORE,
            name='version-diff.md',
            source_type='upload',
            source_uri='docs/release/version.md',
            status='ready',
            active_version=1,
            updated_time=_utc('2026-08-01T00:00:00+00:00'),
        ),
        Document(
            document_id=ids['d3'],
            kb_name=KB_DEV,
            plugin_namespace=NS_CORE,
            name='api-spec.pdf',
            source_type='upload',
            source_uri='docs/spec/api.pdf',
            status='ready',
            active_version=1,
            updated_time=_utc('2026-08-20T00:00:00+00:00'),
        ),
        Document(
            document_id=ids['d4'],
            kb_name=KB_DEV,
            plugin_namespace=NS_ACME,
            name='install-guide.md',
            source_type='upload',
            source_uri='docs/guide/install.md',
            status='ready',
            active_version=1,
            updated_time=_utc('2026-07-01T00:00:00+00:00'),
        ),
    ]
    keywords = [
        DocumentKeyword(document_id=ids['d1'], keyword='安装', kb_name=KB_DEV, plugin_namespace=NS_CORE),
        DocumentKeyword(document_id=ids['d1'], keyword='linux', kb_name=KB_DEV, plugin_namespace=NS_CORE),
        DocumentKeyword(document_id=ids['d2'], keyword='版本差异', kb_name=KB_DEV, plugin_namespace=NS_CORE),
        DocumentKeyword(document_id=ids['d3'], keyword='接口', kb_name=KB_DEV, plugin_namespace=NS_CORE),
        DocumentKeyword(document_id=ids['d4'], keyword='安装', kb_name=KB_DEV, plugin_namespace=NS_ACME),
    ]
    session.add_all(docs + keywords)
    await session.flush()
    return ids


def _resolve(*, plugin_namespace: str = NS_CORE, **filters: Any) -> list[str] | None:
    async def _run() -> list[str] | None:
        engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                await _seed(session)
                return await document_dao.resolve_searchable_document_ids(
                    session,
                    kb_name=KB_DEV,
                    plugin_namespace=plugin_namespace,
                    **filters,
                )
        finally:
            await engine.dispose()

    result = asyncio.run(_run())
    return sorted(result) if result is not None else None


def test_no_filters_returns_none() -> None:
    assert _resolve() is None


def test_tag_filter_exact_match() -> None:
    assert _resolve(tag='接口') == sorted({'pgtest-d3-api-pdf'})


def test_keyword_filter_fuzzy() -> None:
    assert _resolve(keyword='版本') == sorted({'pgtest-d2-version-md'})


def test_file_type_filter() -> None:
    assert _resolve(file_type='.PDF') == sorted({'pgtest-d3-api-pdf'})


def test_path_prefix_filter() -> None:
    assert _resolve(path_prefix='docs/release') == sorted({'pgtest-d2-version-md'})


def test_updated_window_filter() -> None:
    hits = _resolve(updated_after=_utc('2026-06-01T00:00:00+00:00'))
    assert hits == sorted({'pgtest-d2-version-md', 'pgtest-d3-api-pdf'})


def test_file_name_filter() -> None:
    assert _resolve(file_name='install') == sorted({'pgtest-d1-install-md'})


def test_empty_filter_match_short_circuits_empty_list() -> None:
    assert _resolve(tag='不存在的标签') == []


def test_cross_tenant_invisibility_same_kb_name() -> None:
    """同 KB 名不同租户：core 看不到 acme 文档，acme 也看不到 core 文档。"""
    assert _resolve(keyword='安装') == sorted({'pgtest-d1-install-md'})
    assert _resolve(plugin_namespace=NS_ACME, keyword='安装') == sorted({'pgtest-d4-acme-install-md'})
    assert _resolve(plugin_namespace=NS_ACME, tag='接口') == []
