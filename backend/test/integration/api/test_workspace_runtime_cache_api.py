from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from ars.config import get_legacy_storage_dir, get_runtime_dir

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


def _file_snapshot(roots: list[Path]) -> dict[Path, tuple[int, int]]:
    """记录真实文件的大小与修改时间，用于证明请求写入边界。"""
    snapshot: dict[Path, tuple[int, int]] = {}
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_file():
                stat = path.stat()
                snapshot[path] = (stat.st_size, stat.st_mtime_ns)
    return snapshot


async def test_office_preview_cache_is_written_only_to_api_runtime(test_client, admin_headers):
    """真实上传和两次预览应只在 API 运行目录生成可重建缓存。"""
    fixture = Path(__file__).resolve().parents[2] / "data" / "测试文档.docx"
    filename = f"pytest-runtime-cache-{uuid4().hex}.docx"
    workspace_path = f"/{filename}"
    runtime_cache = get_runtime_dir() / "cache" / "office-previews"
    legacy_cache_dirs = set(get_legacy_storage_dir().rglob(".office_preview_cache"))
    runtime_before = _file_snapshot([runtime_cache])
    legacy_before = _file_snapshot(list(legacy_cache_dirs))

    try:
        with fixture.open("rb") as source:
            upload = await test_client.post(
                "/api/workspace/upload",
                data={"parent_path": "/"},
                files={
                    "files": (
                        filename,
                        source,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )
                },
                headers=admin_headers,
            )
        assert upload.status_code == 200, upload.text

        first = await test_client.get("/api/workspace/file", params={"path": workspace_path}, headers=admin_headers)
        second = await test_client.get("/api/workspace/file", params={"path": workspace_path}, headers=admin_headers)

        assert first.status_code == 200, first.text
        assert second.status_code == 200, second.text
        assert first.headers["content-type"].startswith("application/pdf")
        assert first.content.startswith(b"%PDF-")
        assert second.content == first.content

        runtime_after = _file_snapshot([runtime_cache])
        legacy_cache_dirs_after = set(get_legacy_storage_dir().rglob(".office_preview_cache"))
        assert set(runtime_after) - set(runtime_before)
        assert legacy_cache_dirs_after == legacy_cache_dirs
        assert _file_snapshot(list(legacy_cache_dirs_after)) == legacy_before
    finally:
        await test_client.delete("/api/workspace/file", params={"path": workspace_path}, headers=admin_headers)
        for cache_path in set(_file_snapshot([runtime_cache])) - set(runtime_before):
            cache_path.unlink(missing_ok=True)
        for legacy_cache_dir in set(get_legacy_storage_dir().rglob(".office_preview_cache")) - legacy_cache_dirs:
            shutil.rmtree(legacy_cache_dir, ignore_errors=True)
