"""知识库端点的响应契约：响应体必须与 handler 装配出的载荷逐键一致。

`response_model` 会按模型裁剪响应体，模型漏字段就会静默丢数据；声明了「有时不下发」的
字段又会让响应多出 null 键。断言「响应 JSON == 载荷」同时守住两个方向，因此这些用例
就是补 schema 时的 oracle：模型写窄或写宽都会失败。

覆盖 `knowledge_router.py` 的全部 56 个端点与 `external_kb_router.py` 的全部 5 个端点。
"""

from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from ars.knowledge.read_models import KnowledgeBaseDetail, KnowledgeBaseSummary
from ars.permissions import ResourcePermission
from server.utils.auth_middleware import get_admin_user, get_db, get_required_user
from server.utils.knowledge_permissions import require_knowledge_base_manage, require_knowledge_base_read
from server.utils.knowledge_response import serialize_knowledge_base, serialize_knowledge_base_list
from test.support.response_contract import uncovered_paths

pytestmark = pytest.mark.unit

knowledge_router_module = importlib.import_module("server.routers.knowledge_router")
external_module = importlib.import_module("server.routers.external_kb_router")


# =============================================================================
# === 客户端与假对象 ===
# =============================================================================


def _client() -> TestClient:
    app = FastAPI()
    # 与 `server/routers/__init__.py` 一致：external 先注册，避免 `/databases/{kb_id}` 抢占
    # `/databases/external`。
    app.include_router(external_module.external_kb, prefix="/api")
    app.include_router(knowledge_router_module.knowledge, prefix="/api")

    # superadmin 让 `/databases/{kb_id}` 的权限解析稳定得到 MANAGE，断言只盯响应形状。
    fake_user = SimpleNamespace(uid="admin", role="superadmin", department_id=1)

    async def _fake_db() -> None:
        return None

    async def _fake_user() -> SimpleNamespace:
        return fake_user

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    app.dependency_overrides[get_admin_user] = _fake_user
    app.dependency_overrides[require_knowledge_base_read] = _fake_user
    app.dependency_overrides[require_knowledge_base_manage] = _fake_user
    return TestClient(app)


def _patch_kb(monkeypatch: pytest.MonkeyPatch, **methods: Any) -> SimpleNamespace:
    """用带指定异步方法的假知识库替换两个路由模块里的运行时单例。"""

    fake = SimpleNamespace(**methods)
    monkeypatch.setattr(knowledge_router_module, "knowledge_base", fake)
    monkeypatch.setattr(external_module, "knowledge_base", fake)
    return fake


def _patch_doc_support(monkeypatch: pytest.MonkeyPatch, **overrides: Any) -> SimpleNamespace:
    """替换文档能力校验 helper，返回带知识库名称的假详情。"""

    fields: dict[str, Any] = {
        "name": "测试库",
        "kb_type": "milvus",
        "pending_parse_count": 2,
        "pending_index_count": 2,
    }
    fields.update(overrides)
    db_info = SimpleNamespace(**fields)

    async def _fake(kb_id: str, operation: str) -> SimpleNamespace:
        return db_info

    monkeypatch.setattr(knowledge_router_module, "_ensure_database_supports_documents", _fake)
    return db_info


def _patch_noop(monkeypatch: pytest.MonkeyPatch, *names: str) -> None:
    """把模块里的副作用函数替换为无操作异步函数。"""

    async def _noop(*_args: Any, **_kwargs: Any) -> None:
        return None

    for name in names:
        monkeypatch.setattr(knowledge_router_module, name, _noop)


def _kb_detail(**overrides: Any) -> KnowledgeBaseDetail:
    base: dict[str, Any] = dict(
        kb_id="kb_1",
        name="测试库",
        description="描述",
        kb_type="milvus",
        embedding_model_spec="openai/emb",
        llm_model_spec="openai/llm",
        query_params={"options": {"final_top_k": 5}},
        additional_params={"foo": "bar"},
        share_config={"version": 2, "read_scope": None, "manage_scope": None},
        created_by="admin",
        created_at=None,
        file_count=3,
        folder_count=1,
        row_count=3,
        total_size=321,
        chunk_count=12,
        token_count=120,
        pending_parse_count=1,
        pending_index_count=2,
        processing_count=1,
    )
    base.update(overrides)
    return KnowledgeBaseDetail(**base)


def _kb_summary(**overrides: Any) -> KnowledgeBaseSummary:
    detail = _kb_detail(**overrides)
    return KnowledgeBaseSummary(
        **{key: getattr(detail, key) for key in KnowledgeBaseSummary.__dataclass_fields__}
    )


_STATS = {
    "file_count": 3,
    "folder_count": 1,
    "row_count": 3,
    "total_size": 321,
    "chunk_count": 12,
    "token_count": 120,
    "pending_parse_count": 1,
    "pending_index_count": 2,
    "processing_count": 1,
}

_FILE_META = {
    "file_id": "file_1",
    "kb_id": "kb_1",
    "parent_id": None,
    "filename": "demo.txt",
    "file_type": "txt",
    "path": "minio://knowledgebases/kb_1/upload/demo.txt",
    "markdown_file": "minio://knowledgebases/kb_1/parsed/file_1.md",
    "status": "indexed",
    "content_hash": "hash_1",
    "size": 42,
    "chunk_count": 3,
    "token_count": 30,
    "content_type": "text/plain",
    "processing_params": {"chunk_preset_id": "general"},
    "is_folder": False,
    "error": None,
    "created_by": "admin",
    "updated_by": None,
    "created_at": "2026-10-16T12:00:00+00:00",
    "updated_at": "2026-10-16T12:00:00+00:00",
    "original_filename": "demo",
    "minio_url": "minio://knowledgebases/kb_1/upload/demo.txt",
}


# =============================================================================
# === 知识库管理分组 ===
# =============================================================================


def test_get_databases_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """列表响应与 `serialize_knowledge_base_list` 输出逐键一致。"""

    summary = _kb_summary()

    async def fake_get_databases_by_uid(uid: str) -> list[KnowledgeBaseSummary]:
        return [summary]

    _patch_kb(monkeypatch, get_databases_by_uid=fake_get_databases_by_uid)

    expected = serialize_knowledge_base_list([summary])
    response = _client().get("/api/knowledge/databases")

    assert response.status_code == 200, response.text
    assert response.json() == expected


def test_get_databases_fallback_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """列表兜底分支只带 message 与空 databases，模型不得多出键。"""

    async def fake_get_databases_by_uid(uid: str) -> list[KnowledgeBaseSummary]:
        raise RuntimeError("boom")

    _patch_kb(monkeypatch, get_databases_by_uid=fake_get_databases_by_uid)

    response = _client().get("/api/knowledge/databases")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "获取数据库列表失败 boom", "databases": []}


def test_create_database_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """创建响应是序列化结果再补 `files`，模型必须原样保留全部键。"""

    detail = _kb_detail()

    async def fake_create_database(*_args: Any, **_kwargs: Any) -> KnowledgeBaseDetail:
        return detail

    _patch_kb(monkeypatch, create_database=fake_create_database)
    monkeypatch.setattr(
        "ars.agents.buildin.agent_manager",
        SimpleNamespace(reload_all=_async_noop),
    )

    expected = serialize_knowledge_base(detail)
    expected["files"] = {}
    response = _client().post("/api/knowledge/databases", json={"database_name": "库", "description": "d"})

    assert response.status_code == 200, response.text
    assert response.json() == expected


def test_get_accessible_databases_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """可访问列表逐键一致。"""

    db = _kb_summary(name="库", description=None)

    async def fake_get_databases_by_uid(uid: str) -> list[KnowledgeBaseSummary]:
        return [db]

    _patch_kb(
        monkeypatch,
        get_databases_by_uid=fake_get_databases_by_uid,
        database_type_supports_documents=lambda kb_type: True,
    )
    response = _client().get("/api/knowledge/databases/accessible")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "databases": [
            {
                "name": "库",
                "kb_id": "kb_1",
                "description": "",
                "created_by": "admin",
                "kb_type": "milvus",
                "supports_documents": True,
            }
        ]
    }


def test_get_mindmap_databases_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """思维导图知识库概览逐键一致。"""

    payload = {
        "message": "success",
        "databases": [
            {
                "kb_id": "kb_1",
                "slug": "kb_1",
                "name": "库",
                "description": "",
                "kb_type": "milvus",
                "file_count": 3,
            }
        ],
        "total": 1,
    }

    async def fake_overview(uid: str) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(knowledge_router_module, "get_mindmap_databases_overview", fake_overview)
    response = _client().get("/api/knowledge/mindmap/databases")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_get_mindmap_files_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """思维导图文件列表逐键一致。"""

    payload = {
        "message": "success",
        "kb_id": "kb_1",
        "slug": "kb_1",
        "db_name": "库",
        "files": [
            {"file_id": "file_1", "filename": "demo.txt", "type": "txt", "status": "indexed", "created_at": ""}
        ],
        "total": 1,
        "truncated": False,
    }

    async def fake_files(kb_id: str) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(knowledge_router_module, "get_mindmap_database_files", fake_files)
    response = _client().get("/api/knowledge/databases/kb_1/mindmap/files")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_generate_mindmap_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """全量生成路径（带文件计数）逐键一致。"""

    payload = {
        "message": "success",
        "mindmap": {"content": "库", "children": []},
        "kb_id": "kb_1",
        "slug": "kb_1",
        "db_name": "库",
        "file_count": 2,
        "original_file_count": 5,
        "truncated": True,
    }

    async def fake_generate(kb_id: str, file_ids: Any, user_prompt: str, incremental: bool) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(knowledge_router_module, "generate_database_mindmap", fake_generate)
    response = _client().post("/api/knowledge/databases/kb_1/mindmap/generate", json={})

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_generate_mindmap_incremental_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """增量无变化路径的键集合不同，模型不得补出 file_count/truncated。"""

    payload = {
        "message": "success",
        "mindmap": {"content": "库", "children": []},
        "kb_id": "kb_1",
        "slug": "kb_1",
        "db_name": "库",
        "no_ai_needed": True,
        "no_changes": True,
    }

    async def fake_generate(kb_id: str, file_ids: Any, user_prompt: str, incremental: bool) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(knowledge_router_module, "generate_database_mindmap", fake_generate)
    response = _client().post("/api/knowledge/databases/kb_1/mindmap/generate", json={"incremental": True})

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_get_mindmap_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """已保存思维导图逐键一致。"""

    payload = {
        "message": "success",
        "mindmap": {"content": "库", "children": []},
        "kb_id": "kb_1",
        "slug": "kb_1",
        "db_name": "库",
        "mindmap_file_ids": {"file_1": "demo.txt"},
        "mindmap_metadata": {"generated_at": "2026-10-16T12:00:00+00:00", "file_count": 1, "incremental": False},
    }

    async def fake_data(kb_id: str) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(knowledge_router_module, "get_database_mindmap_data", fake_data)
    response = _client().get("/api/knowledge/databases/kb_1/mindmap")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_get_mindmap_diff_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """思维导图差异逐键一致，含嵌套 added_files 条目。"""

    payload = {
        "has_mindmap": True,
        "tracked_files": ["file_1"],
        "current_files": ["file_1", "file_2"],
        "added_files": [{"file_id": "file_2", "filename": "new.txt", "type": "txt"}],
        "removed_file_ids": [],
        "unchanged_count": 1,
        "needs_update": True,
        "current_total": 2,
        "current_files_truncated": False,
        "kb_id": "kb_1",
        "slug": "kb_1",
        "message": "success",
    }

    async def fake_diff(kb_id: str) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(knowledge_router_module, "get_mindmap_diff", fake_diff)
    response = _client().get("/api/knowledge/databases/kb_1/mindmap/diff")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_get_database_info_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """详情响应与 `serialize_knowledge_base`（带权限）输出逐键一致。"""

    detail = _kb_detail()

    async def fake_get_database_info(kb_id: str, include_files: bool = False) -> KnowledgeBaseDetail:
        return detail

    _patch_kb(monkeypatch, get_database_info=fake_get_database_info)

    expected = serialize_knowledge_base(detail, permission=ResourcePermission.MANAGE)
    response = _client().get("/api/knowledge/databases/kb_1")

    assert response.status_code == 200, response.text
    assert response.json() == expected


def test_repair_stats_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """统计修复响应逐键一致。"""

    payload = {
        "status": "success",
        "stats": dict(_STATS),
        "scanned_files": 10,
        "scanned_indexed_files": 8,
        "skipped_unindexed_files": 2,
        "scanned_token_files": 3,
        "updated_files": 4,
        "updated_chunk_files": 1,
        "updated_token_files": 2,
        "updated_size_files": 1,
    }

    async def fake_repair(kb_id: str) -> dict[str, Any]:
        return payload

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, repair_missing_file_stats=fake_repair)
    response = _client().post("/api/knowledge/databases/kb_1/stats/repair")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_update_database_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """更新响应包一层 message + database。"""

    detail = _kb_detail(name="新名")

    async def fake_update_database(kb_id: str, *args: Any, **kwargs: Any) -> KnowledgeBaseDetail:
        return detail

    _patch_kb(monkeypatch, update_database=fake_update_database)
    response = _client().put("/api/knowledge/databases/kb_1", json={"name": "新名", "description": "d"})

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "更新成功", "database": serialize_knowledge_base(detail)}


def test_delete_database_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """删除只回 message。"""

    async def fake_delete_database(kb_id: str) -> None:
        return None

    _patch_kb(monkeypatch, delete_database=fake_delete_database)
    monkeypatch.setattr(
        "ars.agents.buildin.agent_manager",
        SimpleNamespace(reload_all=_async_noop),
    )
    response = _client().delete("/api/knowledge/databases/kb_1")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "删除成功"}


# =============================================================================
# === 图谱构建分组 ===
# =============================================================================


class _FakeGraphService:
    """按测试注入的返回值提供图谱服务读操作。"""

    def __init__(self, **methods: Any) -> None:
        for name, value in methods.items():
            setattr(self, name, value)


def test_graph_build_status_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """图谱状态响应逐键一致，含 config/extraction_counts/vector_counts。"""

    payload = {
        "kb_id": "kb_1",
        "kb_type": "milvus",
        "configured": True,
        "locked": True,
        "config": {
            "locked": True,
            "extractor_type": "llm",
            "extractor_options": {"model_spec": "openai/llm"},
            "created_at": "2026-10-16T12:00:00+00:00",
            "created_by": "admin",
            "updated_at": None,
            "updated_by": None,
        },
        "total_chunks": 10,
        "pending_chunks": 2,
        "indexed_chunks": 8,
        "structured_chunks": 7,
        "extraction_counts": {"pending": 2, "succeeded": 8, "failed": 0},
        "vector_counts": {"pending": 1, "processing": 0, "indexed": 8, "failed": 1},
        "entity_count": 20,
        "relationship_count": 30,
        "build_task_status": "completed",
        "build_task_progress": 100,
    }

    async def fake_get_status(kb_id: str, *, tasker: Any = None) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(
        knowledge_router_module,
        "MilvusGraphService",
        lambda: _FakeGraphService(get_status=fake_get_status),
    )
    _patch_kb(monkeypatch, get_database_info=_async_return(_kb_detail()))
    response = _client().get("/api/knowledge/databases/kb_1/graph-build/status")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_graph_build_config_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """图谱配置锁定响应逐键一致。"""

    config = {
        "locked": True,
        "extractor_type": "llm",
        "extractor_options": {},
        "created_at": "2026-10-16T12:00:00+00:00",
        "created_by": "admin",
    }

    async def fake_configure(kb_id: str, **kwargs: Any) -> dict[str, Any]:
        return config

    monkeypatch.setattr(
        knowledge_router_module,
        "MilvusGraphService",
        lambda: _FakeGraphService(configure=fake_configure),
    )
    response = _client().post("/api/knowledge/databases/kb_1/graph-build/config", json={"extractor_type": "llm"})

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "图谱抽取配置已锁定", "status": "success", "config": config}


def test_graph_build_index_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """图谱构建受理响应逐键一致。"""

    async def fake_get_status(kb_id: str, *, tasker: Any = None) -> dict[str, Any]:
        return {"locked": True}

    class _Tasker:
        async def enqueue_unique_by_payload(self, **_kwargs: Any) -> tuple[SimpleNamespace, bool]:
            return SimpleNamespace(id="task_1"), True

    monkeypatch.setattr(
        knowledge_router_module,
        "MilvusGraphService",
        lambda: _FakeGraphService(get_status=fake_get_status),
    )
    _patch_kb(monkeypatch, get_database_info=_async_return(_kb_detail()))
    monkeypatch.setattr(knowledge_router_module, "tasker", _Tasker())
    monkeypatch.setattr(knowledge_router_module, "_has_running_graph_build_task", _async_return(False))
    response = _client().post("/api/knowledge/databases/kb_1/graph-build/index")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "图谱构建任务已提交", "status": "queued", "task_id": "task_1"}


def test_graph_build_failed_chunks_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """失败 Chunk 样例响应逐键一致。"""

    payload = {
        "kb_id": "kb_1",
        "samples": [
            {
                "chunk_id": "chunk_1",
                "file_id": "file_1",
                "chunk_index": 0,
                "content": "内容",
                "details": {"status": "failed", "attempt_count": 3},
            }
        ],
    }

    async def fake_samples(kb_id: str, limit: int = 10) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(
        knowledge_router_module,
        "MilvusGraphService",
        lambda: _FakeGraphService(get_failed_chunk_samples=fake_samples),
    )
    response = _client().get("/api/knowledge/databases/kb_1/graph-build/failed-chunks?limit=5")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_graph_build_reset_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """图谱重置响应逐键一致。"""

    payload = {
        "message": "图谱构建状态已重置",
        "status": "success",
        "reset_chunks": 7,
        "clear_extraction_result": True,
        "clear_config": False,
    }

    async def fake_reset(kb_id: str, *, clear_extraction_result: bool, clear_config: bool) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(
        knowledge_router_module,
        "MilvusGraphService",
        lambda: _FakeGraphService(reset=fake_reset),
    )
    monkeypatch.setattr(knowledge_router_module, "_has_running_graph_build_task", _async_return(False))
    response = _client().post("/api/knowledge/databases/kb_1/graph-build/reset", json={})

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_graph_build_reconcile_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """图谱修复受理响应逐键一致。"""

    class _Tasker:
        async def enqueue_unique_by_payload(self, **_kwargs: Any) -> tuple[SimpleNamespace, bool]:
            return SimpleNamespace(id="task_2"), True

    monkeypatch.setattr(
        knowledge_router_module,
        "MilvusGraphService",
        lambda: _FakeGraphService(),
    )
    _patch_kb(monkeypatch, get_database_info=_async_return(_kb_detail()))
    monkeypatch.setattr(knowledge_router_module, "tasker", _Tasker())
    monkeypatch.setattr(knowledge_router_module, "_has_running_graph_build_task", _async_return(False))
    response = _client().post("/api/knowledge/databases/kb_1/graph-build/reconcile", json={"mode": "all_vectors"})

    assert response.status_code == 200, response.text
    assert response.json() == {
        "message": "图谱向量索引修复任务已提交",
        "status": "queued",
        "task_id": "task_2",
        "mode": "all_vectors",
    }


def test_export_database_is_file_response(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
    """导出端点是文件响应，媒体类型不是 JSON。"""

    export_path = tmp_path / "export.csv"
    export_path.write_bytes(b"col\n1\n")

    async def fake_export_data(kb_id: str, format: str, **kwargs: Any) -> str:
        return str(export_path)

    _patch_kb(monkeypatch, export_data=fake_export_data)
    response = _client().get("/api/knowledge/databases/kb_1/export?format=csv")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert response.content == b"col\n1\n"


# =============================================================================
# === 文档管理分组 ===
# =============================================================================


def test_list_documents_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """文档分页列表逐键一致，含嵌套条目与 stats。"""

    payload = {
        "items": [
            {
                "file_id": "file_1",
                "filename": "demo.txt",
                "file_type": "txt",
                "status": "indexed",
                "created_at": "2026-10-16T12:00:00+00:00",
                "updated_at": None,
                "file_size": 42,
                "chunk_count": 3,
                "token_count": 30,
                "created_by": "admin",
                "created_by_name": "管理员",
                "created_by_avatar": None,
                "is_folder": False,
                "parent_id": None,
                "has_children": False,
                "children_count": 0,
                "has_original_file": True,
                "has_parsed_markdown": True,
                "is_virtual_folder": False,
                "path_prefix": None,
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 100,
        "has_more": False,
        "parent_id": None,
        "path_prefix": "",
        "recursive": False,
        "stats": dict(_STATS),
    }

    async def fake_list(kb_id: str, **_kwargs: Any) -> dict[str, Any]:
        return payload

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, list_document_files=fake_list)
    response = _client().get("/api/knowledge/databases/kb_1/documents")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_list_documents_without_stats_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """不请求统计时 `stats` 键整体消失，模型不得补出 null。"""

    payload = {
        "items": [],
        "total": 0,
        "page": 1,
        "page_size": 100,
        "has_more": False,
        "parent_id": "folder-1",
        "path_prefix": "docs",
        "recursive": True,
    }

    async def fake_list(kb_id: str, **_kwargs: Any) -> dict[str, Any]:
        return payload

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, list_document_files=fake_list)
    response = _client().get("/api/knowledge/databases/kb_1/documents?parent_id=folder-1")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_search_documents_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """文件名搜索逐键一致，条目带 parent_id 但不带 is_folder。"""

    payload = {
        "files": [
            {
                "kb_id": "kb_1",
                "kb_name": "测试库",
                "file_id": "file_1",
                "filename": "demo.txt",
                "file_type": "txt",
                "status": "indexed",
                "created_at": "2026-10-16T12:00:00",
                "updated_at": "2026-10-16T12:00:00",
                "file_size": 42,
                "parent_id": "folder-1",
            }
        ],
        "total": 1,
        "offset": 0,
        "limit": 100,
        "has_more": False,
    }

    async def fake_get_database_info(kb_id: str, include_files: bool = False) -> SimpleNamespace:
        return SimpleNamespace(kb_id="kb_1", name="测试库", kb_type="milvus")

    async def fake_search(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        return payload

    _patch_kb(
        monkeypatch,
        get_database_info=fake_get_database_info,
        database_type_supports_documents=lambda kb_type: True,
        search_document_files=fake_search,
    )
    response = _client().get("/api/knowledge/databases/kb_1/documents/search?query=demo")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_document_exists_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """存在性检查逐键一致。"""

    async def fake_exists(kb_id: str, filename: str) -> bool:
        return True

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, document_file_exists=fake_exists)
    response = _client().get("/api/knowledge/databases/kb_1/documents/exists?filename=demo.txt")

    assert response.status_code == 200, response.text
    assert response.json() == {"kb_id": "kb_1", "filename": "demo.txt", "exists": True}


def test_add_documents_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """提交文档处理任务的受理响应逐键一致。"""

    class _Tasker:
        async def enqueue(self, **_kwargs: Any) -> SimpleNamespace:
            return SimpleNamespace(id="task_1")

    item = "minio://knowledgebases/kb_1/upload/demo.txt"
    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, get_database_info=_async_return(_kb_detail()))
    monkeypatch.setattr(knowledge_router_module, "tasker", _Tasker())
    response = _client().post(
        "/api/knowledge/databases/kb_1/documents",
        json={"items": [item], "params": {"content_hashes": {item: "hash_1"}}},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "任务已提交，请在任务中心查看进度", "status": "queued", "task_id": "task_1"}


def test_add_uploaded_documents_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """同步添加结果逐键一致，成功条目带完整 file_meta。"""

    item = "minio://knowledgebases/kb_1/upload/demo.txt"
    file_meta = dict(_FILE_META, status="uploaded")

    async def fake_add_file_record(kb_id: str, item_path: str, params: dict, operator_id: str | None = None):
        return file_meta

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, add_file_record=fake_add_file_record)
    response = _client().post(
        "/api/knowledge/databases/kb_1/documents/add",
        json={"items": [item], "params": {"content_hashes": {item: "hash_1"}}},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "message": "已添加 1 个文件",
        "status": "success",
        "items": [
            {"index": 0, "item": item, "file_id": "file_1", "status": "uploaded", "file_meta": file_meta}
        ],
        "failed_items": [],
        "added": 1,
        "failed": 0,
    }


def test_parse_documents_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """解析任务受理响应逐键一致。"""

    class _Tasker:
        async def enqueue(self, **_kwargs: Any) -> SimpleNamespace:
            return SimpleNamespace(id="task_parse")

    _patch_doc_support(monkeypatch)
    monkeypatch.setattr(knowledge_router_module, "tasker", _Tasker())
    response = _client().post(
        "/api/knowledge/databases/kb_1/documents/parse",
        json={"file_ids": ["file_1"], "params": {}},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "解析任务已提交", "status": "queued", "task_id": "task_parse"}


def test_parse_pending_documents_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """按状态批量解析受理响应逐键一致。"""

    class _Tasker:
        async def enqueue_unique_by_payload(self, **_kwargs: Any) -> tuple[SimpleNamespace, bool]:
            return SimpleNamespace(id="task_pending"), True

    _patch_doc_support(monkeypatch, pending_parse_count=2)
    monkeypatch.setattr(knowledge_router_module, "tasker", _Tasker())
    response = _client().post("/api/knowledge/databases/kb_1/documents/parse-pending")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "message": "解析任务已提交",
        "status": "queued",
        "task_id": "task_pending",
        "queued_count": 2,
    }


def test_parse_pending_documents_empty_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """没有待解析文档时不带 task_id/queued_count，模型不得补 null。"""

    _patch_doc_support(monkeypatch, pending_parse_count=0)
    response = _client().post("/api/knowledge/databases/kb_1/documents/parse-pending")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "没有待解析文档", "status": "success", "queued_count": 0}


def test_index_documents_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """入库任务受理响应逐键一致。"""

    class _Tasker:
        async def enqueue(self, **_kwargs: Any) -> SimpleNamespace:
            return SimpleNamespace(id="task_index")

    _patch_doc_support(monkeypatch)
    monkeypatch.setattr(knowledge_router_module, "tasker", _Tasker())
    response = _client().post(
        "/api/knowledge/databases/kb_1/documents/index",
        json={"file_ids": ["file_1"], "params": {}},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "入库任务已提交", "status": "queued", "task_id": "task_index"}


def test_index_pending_documents_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """按状态批量入库受理响应逐键一致。"""

    class _Tasker:
        async def enqueue_unique_by_payload(self, **_kwargs: Any) -> tuple[SimpleNamespace, bool]:
            return SimpleNamespace(id="task_pending_index"), True

    _patch_doc_support(monkeypatch, pending_index_count=3)
    monkeypatch.setattr(knowledge_router_module, "tasker", _Tasker())
    response = _client().post("/api/knowledge/databases/kb_1/documents/index-pending")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "message": "入库任务已提交",
        "status": "queued",
        "task_id": "task_pending_index",
        "queued_count": 3,
    }


def test_get_document_info_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """文档完整信息逐键一致，含未剔除的图谱字段行。"""

    payload = {
        "meta": dict(_FILE_META),
        "lines": [
            {
                "id": "chunk_1",
                "content": "内容",
                "chunk_order_index": 0,
                "start_char_pos": 0,
                "end_char_pos": 2,
                "start_token_pos": 0,
                "end_token_pos": 2,
                "graph_indexed": True,
                "ent_ids": ["ent_1"],
                "tags": ["tag"],
                "extraction_result": {"entities": []},
            }
        ],
        "content": "markdown 内容",
    }

    async def fake_get_file_info(kb_id: str, doc_id: str) -> dict[str, Any]:
        return payload

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, get_file_info=fake_get_file_info)
    response = _client().get("/api/knowledge/databases/kb_1/documents/file_1")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_get_document_basic_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """文档基本信息只带 meta。"""

    payload = {"meta": dict(_FILE_META)}

    async def fake_basic(kb_id: str, doc_id: str) -> dict[str, Any]:
        return payload

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, get_file_basic_info=fake_basic)
    response = _client().get("/api/knowledge/databases/kb_1/documents/file_1/basic")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_get_document_content_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """内容响应剔除内部图谱字段后的行与载荷一致。"""

    raw_lines = [
        {
            "id": "chunk_1",
            "content": "内容",
            "chunk_order_index": 0,
            "start_char_pos": 0,
            "end_char_pos": 2,
            "start_token_pos": 0,
            "end_token_pos": 2,
            "graph_indexed": True,
            "ent_ids": ["ent_1"],
            "tags": ["tag"],
            "extraction_result": {"entities": []},
        }
    ]
    payload = {"lines": raw_lines, "content": "markdown 内容"}

    async def fake_content(kb_id: str, doc_id: str) -> dict[str, Any]:
        return payload

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, get_file_content=fake_content)
    response = _client().get("/api/knowledge/databases/kb_1/documents/file_1/content")

    stripped = [
        {key: value for key, value in line.items() if key not in {"ent_ids", "extraction_result"}}
        for line in raw_lines
    ]
    assert response.status_code == 200, response.text
    assert response.json() == {"lines": stripped, "content": "markdown 内容"}


def test_batch_delete_documents_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """批量删除全部成功时不下发 failed_items。"""

    async def fake_basic(kb_id: str, doc_id: str) -> dict[str, Any]:
        return {"meta": {"is_folder": False, "path": "minio://b/o", "filename": "demo.txt"}}

    async def fake_delete_file(kb_id: str, doc_id: str) -> None:
        return None

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, get_file_basic_info=fake_basic, delete_file=fake_delete_file)
    _patch_noop(monkeypatch, "_delete_document_storage_objects", "batch_remove_files_from_mindmap")
    response = _client().request(
        "DELETE", "/api/knowledge/databases/kb_1/documents/batch", json=["file_1"]
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "批量删除成功: 已删除 1 个文件", "deleted_count": 1}


def test_delete_document_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """单文件删除只回 message。"""

    async def fake_basic(kb_id: str, doc_id: str) -> dict[str, Any]:
        return {"meta": {"is_folder": False, "path": "minio://b/o", "filename": "demo.txt"}}

    async def fake_delete_file(kb_id: str, doc_id: str) -> None:
        return None

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, get_file_basic_info=fake_basic, delete_file=fake_delete_file)
    _patch_noop(monkeypatch, "_delete_document_storage_objects", "remove_file_from_mindmap")
    response = _client().delete("/api/knowledge/databases/kb_1/documents/file_1")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "删除成功"}


def test_download_document_is_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    """下载端点是流响应，媒体类型来自文件后缀而非 JSON。"""

    async def fake_basic(kb_id: str, doc_id: str) -> dict[str, Any]:
        return {"meta": {"file_type": "file", "path": "minio://knowledgebases/kb_1/upload/demo.txt", "filename": "demo.txt"}}

    class _Minio:
        async def adownload_response(self, *, bucket_name: str, object_name: str) -> Any:
            return _FakeMinioResponse(chunks=[b"data"], content_type="text/plain")

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, get_file_basic_info=fake_basic)
    monkeypatch.setattr(knowledge_router_module, "get_minio_client", lambda: _Minio())
    response = _client().get("/api/knowledge/databases/kb_1/documents/file_1/download")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/plain")
    assert response.content == b"data"


def test_get_kb_image_is_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    """图片代理端点是流响应。"""

    class _Minio:
        async def adownload_response(self, *, bucket_name: str, object_name: str) -> Any:
            return _FakeMinioResponse(chunks=[b"img"], content_type="image/png")

    monkeypatch.setattr(knowledge_router_module, "get_minio_client", lambda: _Minio())
    response = _client().get("/api/knowledge/databases/kb_1/images/kb-images/fig.png")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("image/png")
    assert response.content == b"img"


# =============================================================================
# === 查询分组 ===
# =============================================================================


def test_query_knowledge_base_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """查询结果逐键一致，含动态派生打分键。"""

    result = [
        {
            "content": "命中内容",
            "metadata": {"source": "demo.txt", "chunk_id": "chunk_1", "file_id": "file_1", "chunk_index": 0},
            "score": 0.9,
            "distance": 0.1,
            "rerank_score": 0.95,
            # 未在模型里逐个枚举的派生打分键：`extra="allow"` 必须原样透传。
            "custom_score": 0.5,
        }
    ]

    async def fake_aquery(query: str, kb_id: str, **meta: Any) -> list[dict[str, Any]]:
        return result

    _patch_kb(monkeypatch, aquery=fake_aquery)
    response = _client().post("/api/knowledge/databases/kb_1/query", json={"query": "q", "meta": {}})

    assert response.status_code == 200, response.text
    assert response.json() == {"result": result, "status": "success"}


def test_query_test_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """查询测试主路径是裸列表，响应必须与列表逐键一致。"""

    result = [
        {
            "content": "命中内容",
            "metadata": {"source": "demo.txt", "chunk_id": "chunk_1", "file_id": "file_1", "chunk_index": 0},
            "score": 0.9,
            "distance": 0.1,
        }
    ]

    async def fake_aquery(query: str, kb_id: str, **meta: Any) -> list[dict[str, Any]]:
        return result

    _patch_kb(monkeypatch, aquery=fake_aquery)
    response = _client().post("/api/knowledge/databases/kb_1/query-test", json={"query": "q", "meta": {}})

    assert response.status_code == 200, response.text
    assert response.json() == result


def test_update_query_params_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """更新查询参数响应包 data。"""

    async def fake_update(kb_id: str, params: dict[str, Any]) -> None:
        return None

    _patch_kb(monkeypatch, update_kb_query_params=fake_update)
    params = {"final_top_k": 8}
    response = _client().put("/api/knowledge/databases/kb_1/query-params", json=params)

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": params}


def test_get_query_params_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """查询参数定义响应逐键一致。"""

    config = {
        "type": "milvus",
        "options": [
            {"key": "final_top_k", "label": "最终数量", "type": "number", "default": 10},
        ],
    }

    async def fake_config(kb_id: str) -> dict[str, Any]:
        return config

    _patch_kb(monkeypatch, get_kb_query_params_config=fake_config)
    response = _client().get("/api/knowledge/databases/kb_1/query-params")

    assert response.status_code == 200, response.text
    assert response.json() == {"params": config, "message": "success"}


# =============================================================================
# === 示例问题分组 ===
# =============================================================================


def test_generate_sample_questions_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """AI 生成问题响应逐键一致。"""

    payload = {
        "message": "success",
        "questions": ["问题一？", "问题二？"],
        "count": 2,
        "kb_id": "kb_1",
        "db_name": "测试库",
    }

    async def fake_generate(kb_id: str, count: int = 10) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(knowledge_router_module, "generate_database_sample_questions", fake_generate)
    response = _client().post("/api/knowledge/databases/kb_1/sample-questions", json={"count": 2})

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_get_sample_questions_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """已保存问题列表逐键一致。"""

    payload = {"message": "success", "questions": ["问题一？"], "count": 1, "kb_id": "kb_1"}

    async def fake_get(kb_id: str) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(knowledge_router_module, "get_database_sample_questions", fake_get)
    response = _client().get("/api/knowledge/databases/kb_1/sample-questions")

    assert response.status_code == 200, response.text
    assert response.json() == payload


# =============================================================================
# === 文件与文件夹分组 ===
# =============================================================================


def test_create_folder_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """新建文件夹元数据逐键一致。"""

    folder_meta = {
        "file_id": "folder-1",
        "filename": "新文件夹",
        "is_folder": True,
        "parent_id": None,
        "kb_id": "kb_1",
        "created_at": "2026-10-16T12:00:00+00:00",
        "status": "done",
        "path": "新文件夹",
        "file_type": "folder",
        "created_by": "admin",
    }

    async def fake_create_folder(kb_id: str, folder_name: str, parent_id: Any, operator_id: str) -> dict[str, Any]:
        return folder_meta

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, create_folder=fake_create_folder)
    response = _client().post(
        "/api/knowledge/databases/kb_1/folders", json={"folder_name": "新文件夹", "parent_id": None}
    )

    assert response.status_code == 200, response.text
    assert response.json() == folder_meta


def test_detect_virtual_folders_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """虚拟文件夹检测逐键一致。"""

    payload = {"has_virtual_folders": True, "file_count": 4, "remaining_steps": 6}

    async def fake_detect(kb_id: str) -> dict[str, Any]:
        return payload

    _patch_doc_support(monkeypatch)
    monkeypatch.setattr(knowledge_router_module.knowledge_folder_service, "detect_virtual_folder_data", fake_detect)
    response = _client().get("/api/knowledge/databases/kb_1/virtual-folders/detect")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_migrate_virtual_folders_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """迁移任务受理逐键一致。"""

    class _Tasker:
        async def enqueue_unique_by_payload(self, **_kwargs: Any) -> tuple[SimpleNamespace, bool]:
            return SimpleNamespace(id="task_migrate"), True

    _patch_doc_support(monkeypatch)
    monkeypatch.setattr(knowledge_router_module, "tasker", _Tasker())
    response = _client().post("/api/knowledge/databases/kb_1/virtual-folders/migrate")

    assert response.status_code == 200, response.text
    assert response.json() == {"task_id": "task_migrate", "created": True}


def test_stream_virtual_folder_migration_is_event_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    """迁移事件端点是 SSE 流，不是 JSON 契约。"""

    async def fake_get_task(task_id: str) -> dict[str, Any]:
        return {"id": task_id, "type": "knowledge_virtual_folder_migration", "payload": {"kb_id": "kb_1"}, "status": "success"}

    monkeypatch.setattr(knowledge_router_module.tasker, "get_task", fake_get_task)
    response = _client().get("/api/knowledge/databases/kb_1/virtual-folders/migrations/task_migrate/events")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    assert b"data:" in response.content


def test_rename_folder_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """重命名文件夹返回文件元数据形状。"""

    async def fake_rename(kb_id: str, folder_id: str, folder_name: str) -> dict[str, Any]:
        return dict(_FILE_META, is_folder=True, file_type="folder", path="新名")

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, rename_folder=fake_rename)
    response = _client().put("/api/knowledge/databases/kb_1/folders/folder-1/rename", json={"folder_name": "新名"})

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FILE_META, is_folder=True, file_type="folder", path="新名")


def test_move_document_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """移动文件返回文件元数据形状。"""

    async def fake_move(kb_id: str, doc_id: str, new_parent_id: Any) -> dict[str, Any]:
        return dict(_FILE_META, parent_id="folder-2")

    _patch_doc_support(monkeypatch)
    _patch_kb(monkeypatch, move_file=fake_move)
    response = _client().put(
        "/api/knowledge/databases/kb_1/documents/file_1/move", json={"new_parent_id": "folder-2"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == dict(_FILE_META, parent_id="folder-2")


# =============================================================================
# === 文件上传分组 ===
# =============================================================================


_SAME_NAME_FILES = [
    {"file_id": "file_1", "filename": "demo.txt", "size": 42, "created_at": "2026-10-16T12:00:00+00:00", "content_hash": "hash_1"}
]


def test_fetch_url_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """URL 抓取结果逐键一致，含同名文件列表。"""

    class _Minio:
        def ensure_bucket_exists(self, bucket: str) -> None:
            return None

        async def aupload_file(self, **_kwargs: Any) -> SimpleNamespace:
            return SimpleNamespace(url="minio://knowledgebases/kb_1/upload/abc.html")

    _patch_noop(monkeypatch, "_require_manage_permission_if_kb_id")
    _patch_kb(
        monkeypatch,
        file_existed_in_db=_async_return(False),
        get_same_name_files=_async_return(_SAME_NAME_FILES),
    )
    monkeypatch.setattr(
        knowledge_router_module, "fetch_url_content", _async_return((b"<html></html>", "https://example.com/final"))
    )
    monkeypatch.setattr(knowledge_router_module, "calculate_content_hash", _async_return("hash_1"))
    monkeypatch.setattr(knowledge_router_module, "get_minio_client", lambda: _Minio())
    response = _client().post(
        "/api/knowledge/files/fetch-url", json={"url": "https://example.com/a", "kb_id": "kb_1"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "status": "success",
        "file_path": "minio://knowledgebases/kb_1/upload/abc.html",
        "minio_url": "minio://knowledgebases/kb_1/upload/abc.html",
        "content_hash": "hash_1",
        "filename": "https://example.com/a",
        "final_url": "https://example.com/final",
        "size": 13,
        "has_same_name": True,
        "same_name_files": _SAME_NAME_FILES,
    }


def test_import_workspace_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """工作区导入结果逐键一致。"""

    _patch_noop(monkeypatch, "_require_manage_permission_if_kb_id")
    _patch_doc_support(monkeypatch)
    _patch_kb(
        monkeypatch,
        file_existed_in_db=_async_return(False),
        get_same_name_files=_async_return(_SAME_NAME_FILES),
    )
    monkeypatch.setattr(knowledge_router_module, "read_workspace_file_bytes", _async_return(("demo.txt", b"data")))
    monkeypatch.setattr(knowledge_router_module, "is_supported_file_extension", lambda filename: True)
    monkeypatch.setattr(knowledge_router_module, "calculate_content_hash", _async_return("hash_1"))
    monkeypatch.setattr(
        knowledge_router_module, "aupload_file_to_minio", _async_return("minio://knowledgebases/kb_1/upload/demo.txt")
    )
    response = _client().post(
        "/api/knowledge/files/import-workspace", json={"kb_id": "kb_1", "paths": ["demo.txt"]}
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "success"
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["kb_id"] == "kb_1"
    assert item["filename"] == "demo.txt"
    assert item["original_filename"] == "demo"
    assert item["size"] == 4
    assert item["workspace_path"] == "demo.txt"
    assert item["same_name_files"] == _SAME_NAME_FILES
    assert item["has_same_name"] is True
    assert item["file_path"] == "minio://knowledgebases/kb_1/upload/demo.txt"
    assert item["minio_path"] == item["file_path"]
    assert item["bucket_name"] == "knowledgebases"
    assert item["content_hash"] == "hash_1"
    assert item["object_name"].startswith("kb_1/upload/demo_")
    assert item["minio_filename"].startswith("demo_")
    assert item["message"] == "Workspace file successfully imported"
    assert set(item) == set(knowledge_router_module.WorkspaceImportItem.model_fields)


def test_upload_file_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """文件上传结果逐键一致。"""

    _patch_noop(monkeypatch, "_require_manage_permission_if_kb_id")
    _patch_doc_support(monkeypatch)
    _patch_kb(
        monkeypatch,
        file_existed_in_db=_async_return(False),
        get_same_name_files=_async_return(_SAME_NAME_FILES),
    )
    monkeypatch.setattr(knowledge_router_module, "read_upload_with_limit", _async_return(b"data"))
    monkeypatch.setattr(knowledge_router_module, "calculate_content_hash", _async_return("hash_1"))
    monkeypatch.setattr(
        knowledge_router_module, "aupload_file_to_minio", _async_return("minio://knowledgebases/kb_1/upload/demo.txt")
    )
    response = _client().post(
        "/api/knowledge/files/upload",
        files={"file": ("demo.txt", b"data", "text/plain")},
        params={"kb_id": "kb_1"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["message"] == "File successfully uploaded"
    assert body["filename"] == "demo.txt"
    assert body["original_filename"] == "demo"
    assert body["size"] == 4
    assert body["kb_id"] == "kb_1"
    assert body["content_hash"] == "hash_1"
    assert body["has_same_name"] is True
    assert body["same_name_files"] == _SAME_NAME_FILES
    assert set(body) == set(knowledge_router_module.UploadFileResponse.model_fields)


def test_supported_file_types_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """支持文件类型逐键一致。"""

    response = _client().get("/api/knowledge/files/supported-types")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "message": "success",
        "file_types": sorted(knowledge_router_module.SUPPORTED_FILE_EXTENSIONS),
    }


def test_markdown_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """markdown 解析结果逐键一致。"""

    monkeypatch.setattr(knowledge_router_module, "write_upload_to_path", _async_noop)
    monkeypatch.setattr(knowledge_router_module, "parse_document", _async_return("解析后的 markdown"))
    response = _client().post(
        "/api/knowledge/files/markdown",
        files={"file": ("demo.txt", b"data", "text/plain")},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"markdown_content": "解析后的 markdown", "message": "success"}


# =============================================================================
# === 类型与统计分组 ===
# =============================================================================


def test_types_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """知识库类型列表逐键一致。"""

    kb_types = {
        "milvus": {
            "name": "Milvus",
            "description": "向量库",
            "requires_embedding_model": True,
            "supports_documents": True,
            "create_params": {"options": []},
        }
    }

    _patch_kb(monkeypatch, get_supported_kb_types=lambda: kb_types)
    response = _client().get("/api/knowledge/types")

    assert response.status_code == 200, response.text
    assert response.json() == {"kb_types": kb_types, "message": "success"}


def test_chunk_presets_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """分块策略列表逐键一致。"""

    presets = knowledge_router_module.get_chunk_preset_options()
    response = _client().get("/api/knowledge/chunk-presets")

    assert response.status_code == 200, response.text
    assert response.json() == {"chunk_presets": presets, "message": "success"}


def test_stats_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """知识库统计逐键一致。"""

    stats = {"total_databases": 2, "kb_types": {"milvus": 2}, "total_files": 10}

    _patch_kb(monkeypatch, get_statistics=_async_return(stats))
    response = _client().get("/api/knowledge/stats")

    assert response.status_code == 200, response.text
    assert response.json() == {"stats": stats, "message": "success"}


def test_generate_description_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """AI 描述生成结果逐键一致。"""

    class _Model:
        async def call(self, prompt: str) -> SimpleNamespace:
            return SimpleNamespace(content="生成的描述")

    monkeypatch.setattr(
        knowledge_router_module, "system_options", SimpleNamespace(get=_async_return({"default_model": "x"}))
    )
    monkeypatch.setattr("ars.models.select_model", lambda **_kwargs: _Model())
    response = _client().post("/api/knowledge/generate-description", json={"name": "库"})

    assert response.status_code == 200, response.text
    assert response.json() == {"description": "生成的描述", "status": "success"}


# =============================================================================
# === external CLI 分组 ===
# =============================================================================


def test_external_databases_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """CLI 知识库列表逐键一致。"""

    db = _kb_summary(name="库", description=None)

    async def fake_get_databases_by_uid(uid: str) -> list[KnowledgeBaseSummary]:
        return [db]

    _patch_kb(
        monkeypatch,
        get_databases_by_uid=fake_get_databases_by_uid,
        database_type_supports_documents=lambda kb_type: True,
    )
    response = _client().get("/api/knowledge/databases/external")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "databases": [
            {
                "kb_id": "kb_1",
                "name": "库",
                "description": "",
                "kb_type": "milvus",
                "supports_documents": True,
            }
        ]
    }


def test_external_files_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """CLI 文件列表逐键一致，条目带 is_folder 与 parent_id。"""

    payload = {
        "files": [
            {
                "kb_id": "kb_1",
                "kb_name": "库",
                "file_id": "file_1",
                "filename": "demo.txt",
                "file_type": "txt",
                "status": "indexed",
                "created_at": "2026-10-16T12:00:00",
                "updated_at": "2026-10-16T12:00:00",
                "file_size": 42,
                "is_folder": False,
                "parent_id": "folder-1",
            }
        ],
        "total": 1,
        "offset": 0,
        "limit": 100,
        "has_more": False,
    }

    async def fake_get_accessible(uid: str, kb_id: str) -> SimpleNamespace:
        return SimpleNamespace(kb_id="kb_1", name="库", kb_type="milvus")

    async def fake_search(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        return payload

    _patch_kb(
        monkeypatch,
        get_accessible_database_info_by_uid=fake_get_accessible,
        database_type_supports_documents=lambda kb_type: True,
        search_document_files=fake_search,
    )
    response = _client().get("/api/knowledge/databases/external/kb_1/files")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_external_retrieve_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """CLI 检索结果逐键一致。"""

    payload = {
        "kb_id": "kb_1",
        "results": [
            {
                "id": "chunk_1",
                "kb_id": "kb_1",
                "file_id": "file_1",
                "content": "命中内容",
                "metadata": {"source": "demo.txt"},
            }
        ],
    }

    async def fake_get_accessible(uid: str, kb_id: str) -> SimpleNamespace:
        return SimpleNamespace(kb_id="kb_1", name="库", kb_type="milvus")

    async def fake_retrieve(kb_id: str, query: str, **options: Any) -> dict[str, Any]:
        return payload

    _patch_kb(
        monkeypatch,
        get_accessible_database_info_by_uid=fake_get_accessible,
        retrieve=fake_retrieve,
    )
    response = _client().post("/api/knowledge/databases/external/kb_1/retrieve", json={"query": "q"})

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_external_open_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """CLI 打开文件窗口逐键一致。"""

    payload = {
        "kb_id": "kb_1",
        "file_id": "file_1",
        "start_line": 1,
        "end_line": 2,
        "total_lines": 10,
        "offset": 0,
        "window_size": 200,
        "has_more_before": False,
        "has_more_after": True,
        "next_offset": 2,
        "content": "     1\tline\n     2\tline",
    }

    async def fake_get_accessible(uid: str, kb_id: str) -> SimpleNamespace:
        return SimpleNamespace(kb_id="kb_1", name="库", kb_type="milvus")

    async def fake_open(kb_id: str, file_id: str, *, offset: int, limit: int) -> dict[str, Any]:
        return payload

    _patch_kb(
        monkeypatch,
        get_accessible_database_info_by_uid=fake_get_accessible,
        database_type_supports_documents=lambda kb_type: True,
        open_document=fake_open,
    )
    response = _client().get("/api/knowledge/databases/external/kb_1/files/file_1/open")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_external_find_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    """CLI 文件内查找逐键一致，含窗口条目。"""

    payload = {
        "kb_id": "kb_1",
        "file_id": "file_1",
        "semantic": False,
        "match_mode": "keyword",
        "total_matches": 1,
        "windows": [{"start_line": 1, "end_line": 3, "matched_lines": [2], "content": "window"}],
    }

    async def fake_get_accessible(
        uid: str, kb_id: str, *, require_documents: bool = False, operation: str = "文档查看"
    ) -> SimpleNamespace:
        return SimpleNamespace(kb_id="kb_1", name="库", kb_type="milvus")

    async def fake_find(kb_id: str, file_id: str, patterns: list[str], **kwargs: Any) -> dict[str, Any]:
        return payload

    _patch_kb(
        monkeypatch,
        get_accessible_database_info_by_uid=fake_get_accessible,
        database_type_supports_documents=lambda kb_type: True,
        find_in_document=fake_find,
    )
    response = _client().post(
        "/api/knowledge/databases/external/kb_1/files/file_1/find", json={"patterns": ["line"]}
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


# =============================================================================
# === 字段覆盖守卫 ===
# =============================================================================


class _NarrowKnowledgeBaseItem(BaseModel):
    """故意只覆盖少数字段的模型，用来证明字段覆盖检查不是恒真。"""

    kb_id: str


def test_contract_guard_reports_fields_the_model_omits() -> None:
    """负向案例：模型漏掉字段时，覆盖检查必须把它们报出来。"""

    payload = serialize_knowledge_base(_kb_detail(), permission=ResourcePermission.MANAGE)

    missing = uncovered_paths(payload, _NarrowKnowledgeBaseItem)

    assert "metadata" in missing
    assert "effective_permission" in missing
    assert "stats" in missing


def test_contract_guard_accepts_knowledge_base_item() -> None:
    """模型覆盖完整时覆盖检查为空，否则守卫会永远失败。"""

    payload = serialize_knowledge_base(_kb_detail(), permission=ResourcePermission.MANAGE)

    assert uncovered_paths(payload, knowledge_router_module.KnowledgeBaseItem) == []


def test_contract_guard_accepts_file_meta_item() -> None:
    """文件元数据模型覆盖 `_file_record_to_meta` 的全部键。"""

    assert uncovered_paths(_FILE_META, knowledge_router_module.FileMetaItem) == []


def _async_return(value: Any):
    async def _inner(*_args: Any, **_kwargs: Any) -> Any:
        return value

    return _inner


async def _async_noop(*_args: Any, **_kwargs: Any) -> None:
    return None


class _FakeMinioResponse:
    """最小 MinIO 下载响应：按块返回内容并暴露类型头。"""

    def __init__(self, chunks: list[bytes], content_type: str) -> None:
        self._chunks = list(chunks)
        self._content_type = content_type

    def read(self, _size: int) -> bytes:
        return self._chunks.pop(0) if self._chunks else b""

    def getheader(self, _name: str) -> str:
        return self._content_type

    def close(self) -> None:
        return None

    def release_conn(self) -> None:
        return None
