"""整库导出纯函数测试（kb-落地改造清单 §9.2）。

本域无 pytest-asyncio（`pyproject.toml` 未配 asyncio mode），故按既有写法用
同步用例 + `asyncio.run` 驱动协程。

覆盖两块不依赖 DB/网络的逻辑：
1. `build_manifest` —— 清单结构与 ACL 携带（导入侧靠它重建授权）；
2. `write_zip` —— 条目跳过语义、大小封顶（防一个导出打满磁盘/对象存储）、
   zip-slip 防护的文件名净化。
"""

from __future__ import annotations

import asyncio
import json
import zipfile

from typing import TYPE_CHECKING

import pytest

from backend.src.app.kb.service.export_service import (
    MANIFEST_NAME,
    ExportEntry,
    ExportTooLargeError,
    build_manifest,
    write_zip,
)

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

KB = {
    'kb_name': 'export_kb',
    'display_name': '导出测试库',
    'description': '',
    'embedding_model': 'dashscope:test',
    'routing_mode': 'auto',
    'query_params': {},
    'owner_id': '7',
    'is_public': False,
    'plugin_namespace': 'core',
}

DOCS = [
    {
        'document_id': 'd1',
        'name': 'a.md',
        'status': 'ready',
        'sha256': 'x',
        'chunk_count': 3,
        'acl': [{'principal_type': 'dept', 'principal_id': '11'}],
    }
]


def _bytes_loader(payload: bytes | None) -> Callable[[], bytes | None]:
    def _load() -> bytes | None:
        return payload

    return _load


# ---------------- build_manifest ----------------


def test_manifest_carries_kb_and_documents_with_acl() -> None:
    manifest = build_manifest(kb=KB, documents=DOCS, export_id='e1', exported_at='2026-09-29T00:00:00Z')

    assert manifest['manifest_version'] == 1
    assert manifest['export_id'] == 'e1'
    assert manifest['knowledge_base']['kb_name'] == 'export_kb'
    assert manifest['documents'][0]['document_id'] == 'd1'
    # ACL 必须随导出带走，否则导入侧只能重建出「谁都看不见」的文档
    assert manifest['documents'][0]['acl'] == [{'principal_type': 'dept', 'principal_id': '11'}]


def test_manifest_declares_layout_so_import_side_can_locate_files() -> None:
    manifest = build_manifest(kb=KB, documents=[], export_id='e1', exported_at='t')

    assert manifest['layout']['documents'] == 'documents/{document_id}/{name}'
    assert manifest['layout']['parsed'] == 'parsed/{document_id}.md'


def test_manifest_is_json_serializable_with_cjk() -> None:
    manifest = build_manifest(kb=KB, documents=[], export_id='e1', exported_at='t')
    payload = json.loads(json.dumps(manifest, ensure_ascii=False))

    assert payload['knowledge_base']['display_name'] == '导出测试库'


# ---------------- write_zip ----------------


def test_write_zip_packs_entries(tmp_path: Path) -> None:
    entries = [
        ExportEntry(arcname=MANIFEST_NAME, loader=_bytes_loader(b'{"a":1}')),
        ExportEntry(arcname='documents/d1/a.md', loader=_bytes_loader(b'# hi')),
    ]
    target = tmp_path / 'out.zip'

    written, size = asyncio.run(write_zip(entries, target=target, max_bytes=10_000_000))

    assert written == 2
    assert size > 0
    with zipfile.ZipFile(target) as archive:
        assert set(archive.namelist()) == {MANIFEST_NAME, 'documents/d1/a.md'}
        assert archive.read('documents/d1/a.md') == b'# hi'


def test_write_zip_skips_missing_objects_without_failing(tmp_path: Path) -> None:
    """单个对象缺失不该让整次导出失败——聚合产物里少一个文件，比整个导出报错有用。"""
    entries = [
        ExportEntry(arcname=MANIFEST_NAME, loader=_bytes_loader(b'{}')),
        ExportEntry(arcname='documents/d2/gone.pdf', loader=_bytes_loader(None)),
    ]
    target = tmp_path / 'out.zip'

    written, _size = asyncio.run(write_zip(entries, target=target, max_bytes=10_000_000))

    assert written == 1
    with zipfile.ZipFile(target) as archive:
        assert archive.namelist() == [MANIFEST_NAME]


def test_write_zip_supports_async_loaders(tmp_path: Path) -> None:
    async def _load() -> bytes:
        await asyncio.sleep(0)  # 真实的异步来源（如对象存储读取）本就会 await
        return b'async-payload'

    target = tmp_path / 'out.zip'
    written, _size = asyncio.run(
        write_zip([ExportEntry(arcname='a.txt', loader=_load)], target=target, max_bytes=10_000_000)
    )

    assert written == 1
    with zipfile.ZipFile(target) as archive:
        assert archive.read('a.txt') == b'async-payload'


def test_write_zip_raises_when_exceeding_max_bytes(tmp_path: Path) -> None:
    """大小封顶：产物一旦超限立即失败，不留一个把磁盘/对象存储打满的半成品。"""
    # 必须用不可压缩数据：重复字节被 DEFLATE 压到几百字节，产物根本到不了上限，
    # 那样测的就不是封顶逻辑了（封顶按**产物**字节算，因为落盘/落对象存储的是产物）
    import os

    entries = [ExportEntry(arcname=f'f{i}.bin', loader=_bytes_loader(os.urandom(4096))) for i in range(50)]
    target = tmp_path / 'out.zip'

    with pytest.raises(ExportTooLargeError):
        asyncio.run(write_zip(entries, target=target, max_bytes=8192))


def test_write_zip_empty_entries_still_produces_valid_archive(tmp_path: Path) -> None:
    target = tmp_path / 'out.zip'

    written, _size = asyncio.run(write_zip([], target=target, max_bytes=1024))

    assert written == 0
    with zipfile.ZipFile(target) as archive:
        assert archive.namelist() == []
