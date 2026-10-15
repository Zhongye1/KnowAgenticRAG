import pytest

from ars.agents.backends.sandbox import backend as sandbox_backend
from ars.agents.buildin.chatbot.state import merge_subagent_runs
from ars.agents.state import merge_artifacts
from ars.agents.toolkits.buildin.tools import _normalize_presented_artifact_path
from ars.agents.backends.paths import CONVERSATION_HISTORY_DIR_NAME, LARGE_TOOL_RESULTS_DIR_NAME


def _runtime_with_thread(thread_id: str, uid: str = "user-1"):
    context = type(
        "RuntimeContext",
        (),
        {
            "thread_id": thread_id,
            "runtime_scope_id": thread_id,
            "workdir_relative_path": "projects/11111111-1111-4111-8111-111111111111",
            "workdir_path": "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111",
            "uid": uid,
        },
    )()
    return type("RuntimeStub", (), {"context": context})()


def _stub_output_exists(monkeypatch: pytest.MonkeyPatch, exists: bool = True) -> None:
    class FakeBackend:
        def __init__(self, **_kwargs):
            pass

        def regular_file_exists(self, _path: str) -> bool:
            return exists

    monkeypatch.setattr(sandbox_backend, "ProvisionerSandboxBackend", FakeBackend)


def test_merge_artifacts_deduplicates_and_preserves_order():
    assert merge_artifacts(
        ["/home/gem/user-data/outputs/a.md"],
        ["/home/gem/user-data/outputs/a.md", "/home/gem/user-data/outputs/b.md"],
    ) == [
        "/home/gem/user-data/outputs/a.md",
        "/home/gem/user-data/outputs/b.md",
    ]


def test_merge_subagent_runs_does_not_merge_entries_without_run_id():
    assert merge_subagent_runs(
        [{"id": "run-1", "status": "completed"}],
        [
            {"id": "run-1", "status": "failed", "error": "boom"},
            {"id": "run-2", "status": "completed"},
        ],
    ) == [
        {"id": "run-1", "status": "completed"},
        {"id": "run-1", "status": "failed", "error": "boom"},
        {"id": "run-2", "status": "completed"},
    ]


def test_merge_subagent_runs_updates_existing_run_by_run_id():
    assert merge_subagent_runs(
        [
            {
                "id": "tool-1",
                "run_id": "agent-run-1",
                "child_thread_id": "child-thread",
                "status": "running",
            }
        ],
        [
            {
                "id": "tool-1",
                "run_id": "agent-run-1",
                "child_thread_id": "child-thread",
                "status": "completed",
            }
        ],
    ) == [
        {
            "id": "tool-1",
            "run_id": "agent-run-1",
            "child_thread_id": "child-thread",
            "status": "completed",
        }
    ]


def test_merge_subagent_runs_keeps_continuation_run_history():
    assert merge_subagent_runs(
        [
            {
                "id": "tool-old",
                "run_id": "agent-run-old",
                "child_thread_id": "child-thread",
                "status": "completed",
                "completed_at": "2026-06-20T01:00:00Z",
            }
        ],
        [
            {
                "id": "tool-new",
                "run_id": "agent-run-new",
                "child_thread_id": "child-thread",
                "status": "pending",
            }
        ],
    ) == [
        {
            "id": "tool-old",
            "run_id": "agent-run-old",
            "child_thread_id": "child-thread",
            "status": "completed",
            "completed_at": "2026-06-20T01:00:00Z",
        },
        {
            "id": "tool-new",
            "run_id": "agent-run-new",
            "child_thread_id": "child-thread",
            "status": "pending",
        },
    ]


def test_merge_subagent_runs_does_not_merge_different_run_ids_by_state_id():
    assert merge_subagent_runs(
        [
            {
                "id": "tool-1",
                "run_id": "agent-run-old",
                "child_thread_id": "child-thread",
                "status": "completed",
            }
        ],
        [
            {
                "id": "tool-1",
                "run_id": "agent-run-new",
                "child_thread_id": "child-thread",
                "status": "pending",
            }
        ],
    ) == [
        {
            "id": "tool-1",
            "run_id": "agent-run-old",
            "child_thread_id": "child-thread",
            "status": "completed",
        },
        {
            "id": "tool-1",
            "run_id": "agent-run-new",
            "child_thread_id": "child-thread",
            "status": "pending",
        },
    ]


def test_normalize_presented_artifact_path_rejects_host_path():
    with pytest.raises(ValueError, match="可见范围"):
        _normalize_presented_artifact_path(
            "saves/threads/thread-1/user-data/outputs/report.md",
            _runtime_with_thread("thread-1"),
        )


def test_normalize_presented_artifact_path_accepts_virtual_path(monkeypatch: pytest.MonkeyPatch):
    thread_id = "artifacts-virtual-path"
    _stub_output_exists(monkeypatch)

    normalized = _normalize_presented_artifact_path(
        "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/outputs/summary.txt",
        _runtime_with_thread(thread_id),
    )

    assert normalized == "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/outputs/summary.txt"


def test_normalize_presented_artifact_path_accepts_any_visible_regular_file(monkeypatch: pytest.MonkeyPatch):
    thread_id = "artifacts-reject-path"
    _stub_output_exists(monkeypatch)

    assert (
        _normalize_presented_artifact_path(
            "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/uploads/note.txt",
            _runtime_with_thread(thread_id),
        )
        == "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/uploads/note.txt"
    )


def test_normalize_presented_artifact_path_does_not_special_case_internal_names(monkeypatch: pytest.MonkeyPatch):
    thread_id = "artifacts-reject-internal"
    _stub_output_exists(monkeypatch)

    for dir_name in [LARGE_TOOL_RESULTS_DIR_NAME, CONVERSATION_HISTORY_DIR_NAME, "large_tool_history"]:
        path = f"/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/outputs/{dir_name}/stage.txt"
        assert _normalize_presented_artifact_path(path, _runtime_with_thread(thread_id)) == path
