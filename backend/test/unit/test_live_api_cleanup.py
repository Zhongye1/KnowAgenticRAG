from __future__ import annotations

from typing import Any

import httpx
import pytest

from test.live_api_cleanup import (
    TEST_CONVERSATION_TITLE_PREFIX,
    CleanupConversationResource,
    cleanup_e2e_chat_resources,
    cleanup_provisioned_sandboxes,
    cleanup_pytest_knowledge_resources,
    is_test_conversation_title,
    make_test_conversation_metadata,
    make_test_conversation_title,
    make_test_resource_id,
    remove_e2e_thread_storage,
    remove_test_workdir,
)

pytestmark = pytest.mark.asyncio


async def test_cleanup_deletes_every_sandbox_through_provisioner_api():
    """测试环境沙盒只能通过 provisioner 的受控管理接口清理。"""

    deleted_paths: list[str] = []
    sandbox_ids = {"sandbox-one", "sandbox-two"}
    authorization_headers: list[str | None] = []

    def handle_request(request: httpx.Request) -> httpx.Response:
        authorization_headers.append(request.headers.get("Authorization"))
        if request.method == "DELETE":
            deleted_paths.append(request.url.path)
            sandbox_ids.discard(request.url.path.rsplit("/", 1)[-1])
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(
            200,
            json={
                "sandboxes": [{"sandbox_id": sandbox_id} for sandbox_id in sorted(sandbox_ids)],
                "count": len(sandbox_ids),
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handle_request), base_url="http://provisioner"
    ) as client:
        await cleanup_provisioned_sandboxes(client, {"Authorization": "Bearer test-token"})

    assert deleted_paths == ["/api/sandboxes/sandbox-one", "/api/sandboxes/sandbox-two"]
    assert authorization_headers == ["Bearer test-token"] * 4


async def test_cleanup_rejects_delete_that_does_not_remove_sandbox():
    """DELETE 即使返回 200，回读仍存在时也不得伪装清理成功。"""

    def handle_request(request: httpx.Request) -> httpx.Response:
        if request.method == "DELETE":
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(200, json={"sandboxes": [{"sandbox_id": "sandbox-stale"}], "count": 1})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handle_request), base_url="http://provisioner"
    ) as client:
        with pytest.raises(RuntimeError, match="left sandboxes behind: sandbox-stale"):
            await cleanup_provisioned_sandboxes(client, {"Authorization": "Bearer test-token"})


async def test_cleanup_rejects_invalid_provisioner_list_payload():
    """provisioner 未返回真实沙盒列表时必须拒绝伪装成清理成功。"""

    def handle_request(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"count": 0})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handle_request), base_url="http://provisioner"
    ) as client:
        with pytest.raises(RuntimeError, match="missing a sandboxes list"):
            await cleanup_provisioned_sandboxes(client, {"Authorization": "Bearer test-token"})


async def _patch_chat_cleanup_database(
    monkeypatch: pytest.MonkeyPatch,
    resources: dict[str, CleanupConversationResource],
) -> list[set[str]]:
    """打桩清理器的持久化发现、校验与物理删除。"""

    collected: list[set[str]] = []

    async def fake_list_resources(_owner_uid: str) -> dict[str, CleanupConversationResource]:
        return resources

    async def fake_validate(*_args, **_kwargs) -> None:
        return None

    async def fake_list_queued(_thread_ids: set[str]) -> list[str]:
        return []

    async def fake_delete_resources(workdirs, thread_ids: set[str], _project_ids: set[str]) -> None:
        for uid, workdir_path in workdirs:
            remove_test_workdir(uid, workdir_path)
        for thread_id in thread_ids:
            remove_e2e_thread_storage(thread_id)
        collected.append(set(thread_ids))

    monkeypatch.setattr("test.live_api_cleanup.list_test_conversation_resources", fake_list_resources)
    monkeypatch.setattr("test.live_api_cleanup.validate_test_workdirs_exclusive", fake_validate)
    monkeypatch.setattr("test.live_api_cleanup.validate_test_runs_terminal", fake_validate)
    monkeypatch.setattr("test.live_api_cleanup.list_test_queued_request_ids", fake_list_queued)
    monkeypatch.setattr("test.live_api_cleanup.delete_test_conversation_resources", fake_delete_resources)
    monkeypatch.setattr("test.live_api_cleanup.delete_orphaned_test_projects", fake_validate)
    return collected


async def test_cleanup_deletes_pytest_evaluation_resources_and_knowledge_databases():
    """只删除 pytest 前缀资源，并使用知识库真实返回的 kb_id。"""

    deleted_paths: list[str] = []
    responses: dict[str, dict[str, Any]] = {
        "/api/knowledge/databases": {
            "databases": [
                {"kb_id": "kb_test", "name": "Pytest knowledge base"},
                {"kb_id": "kb_legacy", "name": "py_test_legacy"},
                {"kb_id": "kb_prod", "name": "Production knowledge base"},
            ]
        },
        "/api/evaluation/databases/kb_test/runs": {"data": [{"run_id": "run_test", "name": "PYTEST evaluation"}]},
        "/api/evaluation/databases/kb_test/datasets": {"data": [{"dataset_id": "dataset_test", "name": "pytest plan"}]},
        "/api/evaluation/databases/kb_legacy/runs": {"data": []},
        "/api/evaluation/databases/kb_legacy/datasets": {"data": []},
        "/api/evaluation/databases/kb_prod/runs": {"data": [{"run_id": "run_prod", "name": "Production evaluation"}]},
        "/api/evaluation/databases/kb_prod/datasets": {
            "data": [
                {"dataset_id": "dataset_shared_test", "name": "Pytest shared plan"},
                {"dataset_id": "dataset_prod", "name": "Production plan"},
            ]
        },
    }

    def handle_request(request: httpx.Request) -> httpx.Response:
        """返回清理 API 的最小真实 HTTP 响应。"""

        if request.method == "DELETE":
            deleted_paths.append(request.url.path)
            return httpx.Response(200, json={})
        return httpx.Response(200, json=responses[request.url.path])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_request), base_url="http://test") as client:
        await cleanup_pytest_knowledge_resources(client, {"Authorization": "test"})

    assert set(deleted_paths) == {
        "/api/evaluation/databases/kb_test/runs/run_test",
        "/api/evaluation/datasets/dataset_test",
        "/api/evaluation/datasets/dataset_shared_test",
        "/api/knowledge/databases/kb_test",
        "/api/knowledge/databases/kb_legacy",
    }


async def test_cleanup_rejects_knowledge_list_error_payload():
    """知识库列表以 200 返回内部错误时，清理必须显式失败。"""

    def handle_request(request: httpx.Request) -> httpx.Response:
        """模拟知识库列表路由当前的 200 错误响应。"""

        return httpx.Response(200, json={"message": "获取数据库列表失败", "databases": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_request), base_url="http://test") as client:
        with pytest.raises(RuntimeError, match="获取数据库列表失败"):
            await cleanup_pytest_knowledge_resources(client, {"Authorization": "test"})


async def test_cleanup_deletes_e2e_threads_before_temporary_agents(tmp_path, monkeypatch):
    """只删除 E2E 标记的对话和智能体，并允许资源已经不存在。"""

    deleted_paths: list[str] = []
    deleted_row_threads = await _patch_chat_cleanup_database(
        monkeypatch,
        {
            thread_id: CleanupConversationResource(
                conversation_id=index,
                project_id=f"project-{index}",
                thread_id=thread_id,
                uid="test-user",
                status="active",
                workdir_path=None,
            )
            for index, thread_id in enumerate(("thread-viewer", "thread-marked"), start=1)
        },
    )
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    (tmp_path / "threads" / "thread-viewer").mkdir(parents=True)
    (tmp_path / "threads" / "thread-marked").mkdir(parents=True)
    responses: dict[str, object] = {
        "/api/chat/threads": [
            {
                "id": "thread-viewer",
                "title": "viewer-fs-e2e-deadbeef",
                "agent_id": "default-chatbot",
                "metadata": {"_ars_e2e": True, "test": "viewer-fs-e2e"},
            },
            {
                "id": "thread-user",
                "title": "用户自己的对话",
                "agent_id": "default-chatbot",
                "metadata": {},
            },
            {
                "id": "thread-marked",
                "title": "未使用固定前缀",
                "agent_id": "e2e-main-deadbeef",
                "metadata": {"_ars_e2e": True, "marker": "ARS_SUBAGENT_STREAM_E2E_deadbeef"},
            },
        ],
        "/api/agent": {
            "agents": [
                {"slug": "e2e-main-deadbeef", "created_by": "test-user"},
                {"slug": "e2e-main-other-user", "created_by": "other-user"},
                {"slug": "default-chatbot", "created_by": "test-user"},
            ]
        },
    }

    def handle_request(request: httpx.Request) -> httpx.Response:
        """返回对话与智能体清理 API 的最小响应。"""

        if request.method == "DELETE":
            deleted_paths.append(request.url.path)
            return httpx.Response(200, json={})
        return httpx.Response(200, json=responses[request.url.path])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_request), base_url="http://test") as client:
        await cleanup_e2e_chat_resources(
            client,
            {"Authorization": "test"},
            owner_uid="test-user",
        )

    assert deleted_paths == [
        "/api/chat/thread/thread-viewer",
        "/api/chat/thread/thread-marked",
        "/api/agent/e2e-main-deadbeef",
    ]
    assert deleted_row_threads == [{"thread-viewer", "thread-marked"}]
    assert not (tmp_path / "threads" / "thread-viewer").exists()
    assert not (tmp_path / "threads" / "thread-marked").exists()


async def test_cleanup_only_exempts_projects_whose_managed_workdir_is_deleted(tmp_path, monkeypatch):
    """目标 linked Project 共享路径时仍必须被 Workdir 冲突校验视为保留 Owner。"""

    workdir_path = "projects/project-managed"
    managed_dir = tmp_path / workdir_path
    managed_dir.mkdir(parents=True)
    monkeypatch.setattr("test.live_api_cleanup.user_workdir_host_dir", lambda _uid, _path: managed_dir)
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    resources = {
        "thread-managed": CleanupConversationResource(
            1,
            "project-managed",
            "thread-managed",
            "test-user",
            "active",
            workdir_path,
        ),
        "thread-linked": CleanupConversationResource(
            2,
            "project-linked",
            "thread-linked",
            "test-user",
            "active",
            None,
        ),
    }
    await _patch_chat_cleanup_database(monkeypatch, resources)
    validated_project_ids: list[set[str]] = []

    async def capture_validation(_workdirs, project_ids: set[str]):
        validated_project_ids.append(set(project_ids))

    monkeypatch.setattr("test.live_api_cleanup.validate_test_workdirs_exclusive", capture_validation)

    def handle_request(request: httpx.Request) -> httpx.Response:
        if request.method == "DELETE":
            return httpx.Response(200, json={})
        if request.url.path == "/api/chat/threads":
            return httpx.Response(
                200,
                json=[
                    {"id": thread_id, "metadata": {"_ars_test": True}}
                    for thread_id in resources
                ],
            )
        if request.url.path == "/api/agent":
            return httpx.Response(200, json={"agents": []})
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_request), base_url="http://test") as client:
        await cleanup_e2e_chat_resources(client, {"Authorization": "test"}, owner_uid="test-user")

    assert validated_project_ids == [{"project-managed"}]


async def test_cleanup_paginates_active_threads(tmp_path, monkeypatch):
    """活动线程超过单页上限时仍需清理后续页面的 E2E 对话。"""

    deleted_paths: list[str] = []
    deleted_row_threads = await _patch_chat_cleanup_database(
        monkeypatch,
        {
            "thread-page-2": CleanupConversationResource(
                conversation_id=1,
                project_id="project-page-2",
                thread_id="thread-page-2",
                uid="test-user",
                status="active",
                workdir_path=None,
            )
        },
    )
    offsets: list[str] = []
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))

    def handle_request(request: httpx.Request) -> httpx.Response:
        """模拟分两页返回线程的清理 API。"""

        if request.method == "DELETE":
            deleted_paths.append(request.url.path)
            return httpx.Response(200, json={})
        if request.url.path == "/api/chat/threads":
            offset = request.url.params.get("offset") or "0"
            offsets.append(offset)
            if offset == "0":
                return httpx.Response(
                    200,
                    json=[{"id": f"thread-{index}", "is_pinned": False} for index in range(500)],
                )
            return httpx.Response(
                200,
                json=[
                    {
                        "id": "thread-page-2",
                        "title": "任意标题",
                        "metadata": {"_ars_e2e": True, "test": "viewer-fs-e2e"},
                    }
                ],
            )
        if request.url.path == "/api/agent":
            return httpx.Response(200, json={"agents": []})
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_request), base_url="http://test") as client:
        await cleanup_e2e_chat_resources(
            client,
            {"Authorization": "test"},
            owner_uid="test-user",
        )

    assert offsets == ["0", "500"]
    assert deleted_paths == ["/api/chat/thread/thread-page-2"]
    assert deleted_row_threads == [{"thread-page-2"}]


async def test_cleanup_removes_deleted_and_subagent_thread_storage(tmp_path, monkeypatch):
    """已软删除和 subagent 状态的线程也必须回收本地沙盒目录。"""

    deleted_paths: list[str] = []
    deleted_row_threads = await _patch_chat_cleanup_database(
        monkeypatch,
        {
            "thread-deleted": CleanupConversationResource(
                conversation_id=1,
                project_id="project-deleted",
                thread_id="thread-deleted",
                uid="test-user",
                status="deleted",
                workdir_path=None,
            ),
            "thread-child": CleanupConversationResource(
                conversation_id=2,
                project_id="project-child",
                thread_id="thread-child",
                uid="test-user",
                status="subagent",
                workdir_path=None,
            ),
        },
    )
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    for thread_id in ("thread-deleted", "thread-child"):
        (tmp_path / "threads" / thread_id).mkdir(parents=True)

    def handle_request(request: httpx.Request) -> httpx.Response:
        """模拟无 active 线程但存在持久化线程的清理 API。"""

        if request.method == "DELETE":
            deleted_paths.append(request.url.path)
            return httpx.Response(200, json={})
        if request.url.path == "/api/chat/threads":
            return httpx.Response(200, json=[])
        if request.url.path == "/api/agent":
            return httpx.Response(200, json={"agents": []})
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_request), base_url="http://test") as client:
        await cleanup_e2e_chat_resources(
            client,
            {"Authorization": "test"},
            owner_uid="test-user",
        )

    assert deleted_paths == ["/api/chat/thread/thread-child"]
    assert deleted_row_threads == [{"thread-child", "thread-deleted"}]
    assert not (tmp_path / "threads" / "thread-deleted").exists()
    assert not (tmp_path / "threads" / "thread-child").exists()


async def test_remove_e2e_thread_storage_rejects_symlink(tmp_path, monkeypatch):
    """沙盒目录是符号链接时必须拒绝删除，避免解析后误删用户目录。"""

    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    threads_root = tmp_path / "threads"
    threads_root.mkdir()
    user_dir = threads_root / "user-data"
    user_dir.mkdir()
    (threads_root / "thread-e2e").symlink_to(user_dir, target_is_directory=True)

    with pytest.raises(RuntimeError, match="symlink"):
        remove_e2e_thread_storage("thread-e2e")

    assert user_dir.exists()


async def test_test_resource_names_use_one_visible_prefix():
    title = make_test_conversation_title("viewer 文件系统")
    metadata = make_test_conversation_metadata("viewer-filesystem")

    assert title.startswith(TEST_CONVERSATION_TITLE_PREFIX)
    assert metadata["_ars_test"] is True
    assert make_test_resource_id("agent-call").startswith("ARS_TEST_")


async def test_legacy_title_matching_is_exact_and_does_not_capture_user_titles():
    """历史兼容只接受仓库曾生成的固定格式，不按宽泛前缀误删。"""

    assert is_test_conversation_title("viewer-deadbeef")
    assert is_test_conversation_title("pytest-channel-0123abcd")
    assert is_test_conversation_title("pytest-queue-0123abcd")
    assert not is_test_conversation_title("viewer-notes")
    assert not is_test_conversation_title("viewer-deadbeef-personal")


async def test_cleanup_discovery_failure_has_no_destructive_side_effect(tmp_path, monkeypatch):
    """数据库无法确认归属时，不得先软删会话或删除临时智能体。"""

    destructive_paths: list[str] = []
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))

    async def fail_discovery(_owner_uid: str):
        raise OSError("postgres unavailable")

    monkeypatch.setattr("test.live_api_cleanup.list_test_conversation_resources", fail_discovery)

    def handle_request(request: httpx.Request) -> httpx.Response:
        if request.method == "DELETE":
            destructive_paths.append(request.url.path)
            return httpx.Response(200, json={})
        if request.url.path == "/api/chat/threads":
            return httpx.Response(
                200,
                json=[{"id": "thread-marked", "metadata": {"_ars_test": True}}],
            )
        if request.url.path == "/api/agent":
            raise AssertionError("agent cleanup must not run after discovery failure")
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_request), base_url="http://test") as client:
        with pytest.raises(RuntimeError, match="Failed to list persisted"):
            await cleanup_e2e_chat_resources(client, {"Authorization": "test"}, owner_uid="test-user")

    assert destructive_paths == []


async def test_cleanup_guard_failure_has_no_destructive_side_effect(tmp_path, monkeypatch):
    """Run/Workdir guard 拒绝时，对话、文件、历史和智能体均保持不变。"""

    destructive_paths: list[str] = []
    legacy_dir = tmp_path / "threads" / "thread-marked"
    legacy_dir.mkdir(parents=True)
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    resources = {
        "thread-marked": CleanupConversationResource(
            1,
            "project-marked",
            "thread-marked",
            "test-user",
            "active",
            None,
        )
    }

    async def fake_list_resources(_owner_uid: str):
        return resources

    async def fake_workdir_guard(*_args):
        return None

    async def fail_run_guard(_thread_ids: set[str]):
        raise RuntimeError("test Run is not terminal")

    monkeypatch.setattr("test.live_api_cleanup.list_test_conversation_resources", fake_list_resources)
    monkeypatch.setattr("test.live_api_cleanup.validate_test_workdirs_exclusive", fake_workdir_guard)
    monkeypatch.setattr("test.live_api_cleanup.validate_test_runs_terminal", fail_run_guard)

    def handle_request(request: httpx.Request) -> httpx.Response:
        if request.method == "DELETE":
            destructive_paths.append(request.url.path)
            return httpx.Response(200, json={})
        if request.url.path == "/api/chat/threads":
            return httpx.Response(200, json=[{"id": "thread-marked", "metadata": {"_ars_test": True}}])
        if request.url.path == "/api/agent":
            raise AssertionError("agent cleanup must not run after guard failure")
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_request), base_url="http://test") as client:
        with pytest.raises(RuntimeError, match="not terminal"):
            await cleanup_e2e_chat_resources(client, {"Authorization": "test"}, owner_uid="test-user")

    assert destructive_paths == []
    assert legacy_dir.exists()


async def test_cleanup_stops_when_cancelled_request_remains_queued(tmp_path, monkeypatch):
    """取消 API 未真正收敛 queued 请求时，不得继续删除会话、文件或历史。"""

    destructive_paths: list[str] = []
    legacy_dir = tmp_path / "threads" / "thread-marked"
    legacy_dir.mkdir(parents=True)
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))

    async def fake_list_resources(_owner_uid: str):
        return {
            "thread-marked": CleanupConversationResource(
                1,
                "project-marked",
                "thread-marked",
                "test-user",
                "active",
                None,
            )
        }

    async def fake_validate(*_args):
        return None

    async def still_queued(_thread_ids: set[str]) -> list[str]:
        return ["ARS_TEST_queued_request"]

    monkeypatch.setattr("test.live_api_cleanup.list_test_conversation_resources", fake_list_resources)
    monkeypatch.setattr("test.live_api_cleanup.validate_test_workdirs_exclusive", fake_validate)
    monkeypatch.setattr("test.live_api_cleanup.validate_test_runs_terminal", fake_validate)
    monkeypatch.setattr("test.live_api_cleanup.list_test_queued_request_ids", still_queued)

    def handle_request(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/chat/threads":
            return httpx.Response(200, json=[{"id": "thread-marked", "metadata": {"_ars_test": True}}])
        if request.method == "POST" and request.url.path.endswith("/cancel"):
            return httpx.Response(200, json={"status": "cancelled"})
        if request.method == "DELETE":
            destructive_paths.append(request.url.path)
            return httpx.Response(200, json={})
        if request.url.path == "/api/agent":
            raise AssertionError("agent cleanup must not run while a request remains queued")
        raise AssertionError(f"unexpected request: {request.method} {request.url}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_request), base_url="http://test") as client:
        with pytest.raises(RuntimeError, match="left queued requests behind"):
            await cleanup_e2e_chat_resources(client, {"Authorization": "test"}, owner_uid="test-user")

    assert destructive_paths == []
    assert legacy_dir.exists()


async def test_remove_test_workdir_stays_inside_project_boundary(tmp_path, monkeypatch):
    workdir_path = "projects/11111111-1111-4111-8111-111111111111"
    project = tmp_path / workdir_path
    project.mkdir(parents=True)
    (project / "artifact.txt").write_text("test", encoding="utf-8")
    monkeypatch.setattr("test.live_api_cleanup.user_workdir_host_dir", lambda _uid, _path: project)

    remove_test_workdir("test-user", workdir_path)

    assert not project.exists()


async def test_remove_test_workdir_rejects_non_project_path(tmp_path, monkeypatch):
    outside = tmp_path / "agents"
    outside.mkdir()
    monkeypatch.setattr("test.live_api_cleanup.user_workdir_host_dir", lambda _uid, _path: outside)

    with pytest.raises(RuntimeError, match="non-project Workdir"):
        remove_test_workdir("test-user", "agents/skills")

    assert outside.exists()


async def test_remove_test_workdir_rejects_symlink(tmp_path, monkeypatch):
    """Project Workdir 是符号链接时必须拒绝，不能跟随到用户目录。"""

    target = tmp_path / "user-files"
    target.mkdir()
    workdir_path = "projects/22222222-2222-4222-8222-222222222222"
    symlink = tmp_path / workdir_path
    symlink.parent.mkdir()
    symlink.symlink_to(target, target_is_directory=True)
    monkeypatch.setattr("test.live_api_cleanup.user_workdir_host_dir", lambda _uid, _path: symlink)

    with pytest.raises(RuntimeError, match="symlink Workdir"):
        remove_test_workdir("test-user", workdir_path)

    assert target.exists()


async def test_remove_test_workdir_is_idempotent_when_directory_is_gone(tmp_path, monkeypatch):
    workdir_path = "projects/33333333-3333-4333-8333-333333333333"
    missing = tmp_path / workdir_path
    monkeypatch.setattr("test.live_api_cleanup.user_workdir_host_dir", lambda _uid, _path: missing)

    remove_test_workdir("test-user", workdir_path)

    assert not missing.exists()


async def test_is_e2e_thread_recognizes_marker_or_e2e_agent_prefix():
    from test.live_api_cleanup import _is_e2e_thread

    marked = {"id": "t1", "agent_id": "default-chatbot", "metadata": {"_ars_e2e": True, "test": "viewer-fs-e2e"}}
    agent_prefix = {"id": "invocation_x", "agent_id": "e2e-agent-call-deadbeef"}
    unified = {"id": "t3", "title": f"{TEST_CONVERSATION_TITLE_PREFIX}viewer_deadbeef", "metadata": {}}
    explicit = {"id": "t4", "metadata": {"_ars_test": True}}
    plain = {"id": "t2", "agent_id": "default-chatbot"}

    assert _is_e2e_thread(marked)
    assert _is_e2e_thread(agent_prefix)
    assert _is_e2e_thread(unified)
    assert _is_e2e_thread(explicit)
    assert not _is_e2e_thread(plain)
    assert not _is_e2e_thread("not-a-dict")
