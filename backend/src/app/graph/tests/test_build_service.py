"""建图编排测试（D62）：逐块隔离、排除摘要行、台账口径。

最要紧的是**逐块隔离**：一篇长文档几十块，因一块抽取失败而全篇白跑是不可接受的。
以及**摘要行必须排除**——拿"文档自己的概括"抽实体只会得到文档级泛化概念，反而稀释
提及的精度。
"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING, Any

from backend.src.app.graph.service import build_service

if TYPE_CHECKING:
    import pytest


class _EchoExtractor:
    extractor_type = 'llm'

    def __init__(self, *, fail_on: set[str] | None = None) -> None:
        self.fail_on = fail_on or set()
        self.seen: list[str] = []

    async def extract(self, text: str, *, chunk_metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        chunk_id = str((chunk_metadata or {}).get('chunk_id') or '')
        self.seen.append(chunk_id)
        if chunk_id in self.fail_on:
            raise RuntimeError('模型不可用')
        return {'entities': [{'text': f'实体-{chunk_id}', 'label': 'E'}], 'relations': [], 'metadata': {}}


class _Session:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1


def _session() -> Any:
    """db 与 session 以 Any 传入：服务形参声明为 AsyncSession，替身无需真的满足它。"""
    return _Session()


async def _chunk_loader(  # ruff: ignore[unused-async]
    db: Any, *, document_id: str, kb_name: str, plugin_namespace: Any, version_id: Any
) -> list[tuple[str, str]]:
    return [('d1:1:0', '内容 0'), ('d1:1:1', '内容 1'), ('d1:1:2', '内容 2')]


def _build(extractor: Any, session: Any = None, **kwargs: Any) -> dict[str, Any]:
    return asyncio.run(
        build_service.build_document_graph(
            session if session is not None else _session(),
            document_id='d1',
            kb_name='dev',
            extractor=extractor,
            chunk_loader=_chunk_loader,
            **kwargs,
        )
    )


def _patch_write(monkeypatch: pytest.MonkeyPatch, recorder: list[str] | None = None) -> None:
    async def fake_write(  # ruff: ignore[unused-async]
        db: Any, *, chunk_id: str, **kwargs: Any
    ) -> dict[str, int]:
        if recorder is not None:
            recorder.append(chunk_id)
        return {'entities': 1, 'triples': 0, 'mentions': 1}

    monkeypatch.setattr(build_service, 'write_chunk_graph', fake_write)


# ------------------------------------------------------------------ 正向
def test_builds_all_chunks(monkeypatch: pytest.MonkeyPatch) -> None:
    written: list[str] = []
    _patch_write(monkeypatch, written)
    summary = _build(_EchoExtractor())
    assert written == ['d1:1:0', 'd1:1:1', 'd1:1:2']
    assert summary == {'chunks': 3, 'succeeded': 3, 'failed': 0, 'entities': 3, 'triples': 0}


def test_commits_per_chunk(monkeypatch: pytest.MonkeyPatch) -> None:
    """逐块提交：长文档建图耗时数分钟，中途失败也应保留已完成部分。"""
    _patch_write(monkeypatch)
    session = _Session()
    _build(_EchoExtractor(), session=session)
    assert session.commits == 3


def test_empty_document_short_circuits() -> None:
    async def empty_loader(  # ruff: ignore[unused-async]
        db: Any, **kwargs: Any
    ) -> list[tuple[str, str]]:
        return []

    summary = asyncio.run(
        build_service.build_document_graph(
            _session(), document_id='d1', kb_name='dev', extractor=_EchoExtractor(), chunk_loader=empty_loader
        )
    )
    assert summary == {'chunks': 0, 'succeeded': 0, 'failed': 0, 'entities': 0, 'triples': 0}


# ------------------------------------------------------------------ 逐块隔离
def test_one_failed_chunk_does_not_abort_document(monkeypatch: pytest.MonkeyPatch) -> None:
    """一块失败只记该块失败，其余照常建图。"""
    _patch_write(monkeypatch)
    summary = _build(_EchoExtractor(fail_on={'d1:1:1'}))
    assert summary['succeeded'] == 2
    assert summary['failed'] == 1
    assert summary['chunks'] == 3


def test_write_failure_is_isolated_too(monkeypatch: pytest.MonkeyPatch) -> None:
    """写入失败同样只影响该块（抽取成功不等于写入成功）。"""
    calls = {'n': 0}

    async def flaky_write(  # ruff: ignore[unused-async]
        db: Any, *, chunk_id: str, **kwargs: Any
    ) -> dict[str, int]:
        calls['n'] += 1
        if calls['n'] == 2:
            raise RuntimeError('唯一约束冲突')
        return {'entities': 1, 'triples': 0, 'mentions': 1}

    monkeypatch.setattr(build_service, 'write_chunk_graph', flaky_write)
    summary = _build(_EchoExtractor())
    assert summary['succeeded'] == 2
    assert summary['failed'] == 1


def test_all_chunks_failing_still_returns_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_write(monkeypatch)
    summary = _build(_EchoExtractor(fail_on={'d1:1:0', 'd1:1:1', 'd1:1:2'}))
    assert summary['succeeded'] == 0
    assert summary['failed'] == 3


def test_concurrency_does_not_drop_chunks(monkeypatch: pytest.MonkeyPatch) -> None:
    """并发下不得漏块（gather 与 zip 的对齐）。"""
    _patch_write(monkeypatch)
    summary = _build(_EchoExtractor(), concurrency=3)
    assert summary['chunks'] == 3
    assert summary['succeeded'] == 3


# ------------------------------------------------------------------ 默认加载器
def test_default_loader_excludes_section_summaries(monkeypatch: pytest.MonkeyPatch) -> None:
    """摘要行必须排除：拿文档级概括抽实体只会稀释提及精度。"""
    from backend.src.app.graph.service import build_service as module
    from backend.src.app.kb.model.chunk import CHUNK_META_TYPE_KEY
    from backend.src.app.kb.service import chunk_service as cs_module

    class _Row:
        def __init__(self, chunk_id: str, content: str, meta: dict) -> None:
            self.chunk_id = chunk_id
            self.content = content
            self.meta = meta

    rows = [
        _Row('c1', '正文', {}),
        _Row('c2', '章节摘要', {CHUNK_META_TYPE_KEY: 'section_summary'}),
        _Row('c3', '   ', {}),
    ]

    async def fake_list(  # ruff: ignore[unused-async]
        db: Any, document_id: str, **kwargs: Any
    ) -> list[Any]:
        return rows

    monkeypatch.setattr(cs_module.ChunkService, 'list_by_document', staticmethod(fake_list))
    loaded = asyncio.run(
        module._default_chunk_loader(
            _session(), document_id='d1', kb_name='dev', plugin_namespace=None, version_id=None
        )
    )
    assert [chunk_id for chunk_id, _ in loaded] == ['c1']
