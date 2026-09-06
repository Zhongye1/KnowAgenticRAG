"""document_dao.resolve_searchable_document_ids 编译级回归测试。

真实 PG 集成测试（retrieval/tests/test_integration_pg.py）发现旧实现用外层
``document_keywords IN (...)`` 子查询且未与 Document 关联，产生交叉连接——同 KB
任一命中即返回全部文档。本测试在无 DB 环境下断言修复后的 SQL 形态（关联 EXISTS、
无交叉连接），防回归。
"""

from __future__ import annotations

import asyncio

from typing import Any

from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.selectable import Select

from backend.src.app.kb.crud.crud_document import document_dao


class _CapturedSession:
    def __init__(self) -> None:
        self.sql: str | None = None

    async def execute(self, statement: Any) -> Any:
        assert isinstance(statement, Select)
        self.sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}))

        class _Result:
            @staticmethod
            def all() -> list[Any]:
                return []

        return _Result()


def _run(**filters: Any) -> str:
    session = _CapturedSession()
    result = asyncio.run(
        document_dao.resolve_searchable_document_ids(
            session,  # type: ignore[arg-type]
            kb_name='dev',
            plugin_namespace='core',
            **filters,
        )
    )
    assert result == []
    sql = session.sql
    assert sql is not None
    return sql


def test_keyword_filter_compiles_correlated_exists() -> None:
    sql = _run(keyword='安装')
    assert 'EXISTS (SELECT document_keywords.document_id' in sql
    assert 'document_keywords.document_id = documents.document_id' in sql
    # 交叉连接回归防线：外层 FROM 不再同时裸带 document_keywords
    assert 'FROM documents, document_keywords' not in sql


def test_tag_filter_compiles_correlated_exists() -> None:
    sql = _run(tag='接口')
    assert 'EXISTS (SELECT document_keywords.document_id' in sql
    assert 'document_keywords.document_id = documents.document_id' in sql
    assert 'FROM documents, document_keywords' not in sql


def test_no_filter_skips_execute() -> None:
    session = _CapturedSession()
    result = asyncio.run(
        document_dao.resolve_searchable_document_ids(session, kb_name='dev', plugin_namespace='core')  # type: ignore[arg-type]
    )
    assert result is None
    assert session.sql is None
