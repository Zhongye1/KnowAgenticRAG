from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from ars.services import memory_service
from ars.workspace import paths as workspace_paths
from ars.workspace.filesystem import Workspace

pytestmark = pytest.mark.unit


def test_build_memory_update_appends_and_deduplicates():
    current = "# MEMORY\n\n旧记忆\n"

    updated, status, start_line, end_line = memory_service._build_memory_update(current, "新记忆", None)
    unchanged, unchanged_status, un_start, un_end = memory_service._build_memory_update(updated, "  新记忆  ", None)

    assert status == "updated"
    assert updated == "# MEMORY\n\n旧记忆\n\n新记忆\n"
    assert start_line == 5
    assert end_line == 5
    assert unchanged_status == "unchanged"
    assert unchanged == updated
    assert un_start == 5
    assert un_end == 5


def test_build_memory_update_requires_unique_exact_replacement():
    updated, status, start_line, end_line = memory_service._build_memory_update("旧值", "新值", "旧值")

    assert status == "updated"
    assert updated == "新值"
    assert start_line == 1
    assert end_line == 1
    with pytest.raises(ValueError, match="匹配 0 处"):
        memory_service._build_memory_update(updated, "再次更新", "旧值")
    with pytest.raises(ValueError, match="匹配 2 处"):
        memory_service._build_memory_update("旧值 / 旧值", "新值", "旧值")


def test_validate_replaces_preserves_exact_whitespace():
    value = "  旧值\n"

    assert memory_service._validate_argument(value, name="replaces") == value


def test_replace_authorized_file_is_atomic_on_publish_failure(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    workspace_paths.ensure_user_workspace("user-1")
    workspace = Workspace("user-1")
    original = workspace.read_authorized_file(memory_service.MEMORY_PATH, 1024)

    def fail_rename(*_args, **_kwargs):
        raise OSError("publish failed")

    monkeypatch.setattr("ars.workspace.filesystem.os.rename", fail_rename)

    with pytest.raises(OSError, match="publish failed"):
        workspace.replace_authorized_file(memory_service.MEMORY_PATH, b"new")
    assert workspace.read_authorized_file(memory_service.MEMORY_PATH, 1024) == original


async def test_remember_memory_validates_run_and_publishes_append(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    workspace_paths.ensure_user_workspace("user-1")
    events: list[str] = []

    class FakeDB:
        async def execute(self, _statement, _params):
            events.append("advisory")

    @asynccontextmanager
    async def fake_session():
        yield FakeDB()

    class FakeRunRepository:
        def __init__(self, _db):
            pass

        async def lock_memory_write(self, *_args, **_kwargs):
            events.append("run")
            return SimpleNamespace(id="run-1")

    async def fake_load_config(_db, uid: str):
        assert uid == "user-1"
        events.append("config")
        return SimpleNamespace(schema=SimpleNamespace(enable_memory=True))

    monkeypatch.setattr(memory_service.pg_manager, "get_async_session_context", fake_session)
    monkeypatch.setattr(memory_service, "AgentRunRepository", FakeRunRepository)
    monkeypatch.setattr(memory_service.UserConfig, "load", fake_load_config)

    result = await memory_service.remember_memory(
        uid="user-1",
        thread_id="thread-1",
        run_id="run-1",
        request_id="request-1",
        worker_id="worker-1",
        content="请使用中文",
    )

    stored = Workspace("user-1").read_authorized_file(memory_service.MEMORY_PATH, 1024).decode()
    assert events == ["advisory", "run", "config"]
    assert result["status"] == "updated"
    assert result["start_line"] == 5
    assert result["end_line"] == 5
    assert stored.endswith("请使用中文\n")


async def test_remember_memory_fails_closed_when_config_disabled(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    workspace_paths.ensure_user_workspace("user-1")
    original = Workspace("user-1").read_authorized_file(memory_service.MEMORY_PATH, 1024)

    class FakeDB:
        async def execute(self, _statement, _params):
            return None

    @asynccontextmanager
    async def fake_session():
        yield FakeDB()

    class FakeRunRepository:
        def __init__(self, _db):
            pass

        async def lock_memory_write(self, *_args, **_kwargs):
            return SimpleNamespace(id="run-1")

    async def fake_load_config(_db, _uid: str):
        return SimpleNamespace(schema=SimpleNamespace(enable_memory=False))

    monkeypatch.setattr(memory_service.pg_manager, "get_async_session_context", fake_session)
    monkeypatch.setattr(memory_service, "AgentRunRepository", FakeRunRepository)
    monkeypatch.setattr(memory_service.UserConfig, "load", fake_load_config)

    with pytest.raises(ValueError, match="Memory 已关闭"):
        await memory_service.remember_memory(
            uid="user-1",
            thread_id="thread-1",
            run_id="run-1",
            request_id="request-1",
            worker_id="worker-1",
            content="不应写入",
        )
    assert Workspace("user-1").read_authorized_file(memory_service.MEMORY_PATH, 1024) == original


async def test_remember_memory_rejects_oversized_source(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    workspace_paths.ensure_user_workspace("user-1")
    memory_path = tmp_path / "threads" / "shared" / "user-1" / "workspace" / "agents" / "MEMORY.md"
    memory_path.write_bytes(b"x" * (memory_service.MEMORY_FILE_MAX_BYTES + 1))

    with pytest.raises(ValueError, match="memory_too_large"):
        memory_service._read_memory_file("user-1")


async def test_remember_memory_recreates_deleted_file(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    workspace_paths.ensure_user_workspace("user-1")
    memory_path = tmp_path / "threads" / "shared" / "user-1" / "workspace" / "agents" / "MEMORY.md"
    memory_path.unlink()

    class FakeDB:
        async def execute(self, _statement, _params):
            return None

    @asynccontextmanager
    async def fake_session():
        yield FakeDB()

    class FakeRunRepository:
        def __init__(self, _db):
            pass

        async def lock_memory_write(self, *_args, **_kwargs):
            return SimpleNamespace(id="run-1")

    async def fake_load_config(_db, _uid: str):
        return SimpleNamespace(schema=SimpleNamespace(enable_memory=True))

    monkeypatch.setattr(memory_service.pg_manager, "get_async_session_context", fake_session)
    monkeypatch.setattr(memory_service, "AgentRunRepository", FakeRunRepository)
    monkeypatch.setattr(memory_service.UserConfig, "load", fake_load_config)

    result = await memory_service.remember_memory(
        uid="user-1",
        thread_id="thread-1",
        run_id="run-1",
        request_id="request-1",
        worker_id="worker-1",
        content="重建后的第一条记忆",
    )

    assert result["status"] == "updated"
    assert result["start_line"] == 1
    assert memory_path.read_text(encoding="utf-8") == "重建后的第一条记忆\n"


async def test_load_memory_prompt_returns_none_when_file_missing_or_empty(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    workspace_paths.ensure_user_workspace("user-1")
    memory_path = tmp_path / "threads" / "shared" / "user-1" / "workspace" / "agents" / "MEMORY.md"

    @asynccontextmanager
    async def fake_session():
        yield object()

    async def fake_load_config(_db, _uid: str):
        return SimpleNamespace(schema=SimpleNamespace(enable_memory=True))

    monkeypatch.setattr(memory_service.pg_manager, "get_async_session_context", fake_session)
    monkeypatch.setattr(memory_service.UserConfig, "load", fake_load_config)

    memory_path.unlink()
    assert await memory_service.load_memory_prompt("user-1") is None

    memory_path.write_text("   \n", encoding="utf-8")
    assert await memory_service.load_memory_prompt("user-1") is None


async def test_load_memory_prompt_respects_switch_and_budget(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    workspace_paths.ensure_user_workspace("user-1")
    memory_path = tmp_path / "threads" / "shared" / "user-1" / "workspace" / "agents" / "MEMORY.md"
    memory_path.write_text("记" * memory_service.MEMORY_PROMPT_MAX_BYTES, encoding="utf-8")

    @asynccontextmanager
    async def fake_session():
        yield object()

    enabled = True

    async def fake_load_config(_db, _uid: str):
        return SimpleNamespace(schema=SimpleNamespace(enable_memory=enabled))

    monkeypatch.setattr(memory_service.pg_manager, "get_async_session_context", fake_session)
    monkeypatch.setattr(memory_service.UserConfig, "load", fake_load_config)

    prompt = await memory_service.load_memory_prompt("user-1")
    assert "内容已截断" in prompt

    enabled = False
    assert await memory_service.load_memory_prompt("user-1") is None
