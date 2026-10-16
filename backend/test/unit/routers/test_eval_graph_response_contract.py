"""评估与图谱端点的响应契约：响应体必须与 router 装配出的载荷逐键一致。

`response_model` 会按模型裁剪响应体，模型漏字段就会静默丢数据；声明了「有时不下发」的
字段又会让响应多出 null 键。断言「响应 JSON == 载荷」同时守住两个方向，因此这些用例
就是补 schema 时的 oracle：模型写窄或写宽都会失败。
"""

from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any, ClassVar

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from server.utils.auth_middleware import get_admin_user
from test.support.response_contract import uncovered_paths

pytestmark = pytest.mark.unit

eval_module = importlib.import_module("server.routers.knowledge_eval_router")
graph_module = importlib.import_module("server.routers.graph_router")


# =============================================================================
# === 评估：载荷 fixture（对齐 EvaluationService 的真实序列化输出） ===
# =============================================================================


def _dataset(**overrides: Any) -> dict[str, Any]:
    """`EvaluationService._dataset_to_dict` 的真实输出形状。"""

    item: dict[str, Any] = {
        "id": "dataset_abcd1234",
        "dataset_id": "dataset_abcd1234",
        "name": "pytest dataset",
        "description": None,
        "kb_id": "kb-1",
        "item_count": 2,
        "has_gold_chunks": True,
        "has_gold_answers": False,
        "build_metadata": {"source": "upload", "status": "completed", "progress": 100, "filename": "d.jsonl"},
        "created_by": "admin",
        "created_at": "2026-10-16T12:00:00Z",
        "updated_at": "2026-10-16T12:00:00Z",
    }
    item.update(overrides)
    return item


def _dataset_detail() -> dict[str, Any]:
    return {
        **_dataset(),
        "items": [
            {
                "item_id": "dataset_item_1",
                "item_index": 0,
                "query": "什么是单元测试？",
                "gold_chunk_ids": ["chunk-1"],
                "gold_answer": None,
            }
        ],
        "pagination": {
            "current_page": 1,
            "page_size": 10,
            "total_items": 1,
            "total_pages": 1,
            "has_next": False,
            "has_prev": False,
        },
    }


def _run(**overrides: Any) -> dict[str, Any]:
    """`EvaluationService.list_runs` 的真实输出形状（非运行中）。"""

    item: dict[str, Any] = {
        "run_id": "run_abcd1234",
        "name": "eval-20261016-abcdef",
        "dataset_id": "dataset_abcd1234",
        "status": "completed",
        "started_at": "2026-10-16T12:00:00Z",
        "completed_at": "2026-10-16T12:05:00Z",
        "total_items": 2,
        "completed_items": 2,
        "overall_score": 0.85,
        "retrieval_config": {"top_k": 5},
        "metrics": {"recall@5": 0.9},
    }
    item.update(overrides)
    return item


def _run_results() -> dict[str, Any]:
    """`EvaluationService.get_run_results` 的真实输出形状（运行已落库）。"""

    return {
        "run_id": "run_abcd1234",
        "name": "eval-20261016-abcdef",
        "status": "completed",
        "started_at": "2026-10-16T12:00:00Z",
        "completed_at": "2026-10-16T12:05:00Z",
        "total_items": 2,
        "completed_items": 2,
        "overall_score": 0.85,
        "retrieval_config": {"top_k": 5},
        "items": [
            {
                "query": "什么是单元测试？",
                "gold_chunk_ids": ["chunk-1"],
                "gold_answer": "自动化测试",
                "generated_answer": "用于验证行为的自动化测试",
                "retrieved_chunks": [{"chunk_id": "chunk-1", "content": "..."}],
                "metrics": {"score": 0.9},
            }
        ],
        "pagination": {"current_page": 1, "page_size": 20, "total": 1, "total_pages": 1, "error_only": False},
    }


class _FakeEvaluationService:
    """只提供被转换端点需要的读取与写入；返回载荷由用例注入。"""

    upload_result: ClassVar[dict[str, Any]] = {}
    list_result: ClassVar[list[dict[str, Any]]] = []
    detail_result: ClassVar[dict[str, Any]] = {}
    generate_result: ClassVar[dict[str, Any]] = {}
    resume_result: ClassVar[dict[str, Any]] = {}
    run_id: ClassVar[str] = "run_abcd1234"
    list_runs_result: ClassVar[list[dict[str, Any]]] = []
    run_results_result: ClassVar[dict[str, Any]] = {}
    export_result: ClassVar[dict[str, str]] = {"filename": "d.jsonl", "content": '{"query": "q"}\n'}

    def __init__(self) -> None:
        pass

    async def upload_dataset(self, **_kwargs: Any) -> dict[str, Any]:
        return dict(type(self).upload_result)

    async def list_datasets(self, _kb_id: str) -> list[dict[str, Any]]:
        return list(type(self).list_result)

    async def get_dataset_detail(self, _kb_id: str, _dataset_id: str, _page: int, _page_size: int) -> dict[str, Any]:
        return dict(type(self).detail_result)

    async def export_dataset_jsonl(self, _dataset_id: str) -> dict[str, str]:
        return dict(type(self).export_result)

    async def delete_dataset(self, _dataset_id: str) -> None:
        return None

    async def generate_dataset(self, **_kwargs: Any) -> dict[str, Any]:
        return dict(type(self).generate_result)

    async def resume_dataset_generation(self, **_kwargs: Any) -> dict[str, Any]:
        return dict(type(self).resume_result)

    async def run_evaluation(self, **_kwargs: Any) -> str:
        return type(self).run_id

    async def list_runs(self, _kb_id: str) -> list[dict[str, Any]]:
        return list(type(self).list_runs_result)

    async def get_run_results(self, _kb_id: str, _run_id: str, **_kwargs: Any) -> dict[str, Any]:
        return dict(type(self).run_results_result)

    async def delete_run(self, _kb_id: str, _run_id: str) -> None:
        return None


def _eval_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(eval_module, "EvaluationService", _FakeEvaluationService)

    app = FastAPI()
    app.include_router(eval_module.evaluation, prefix="/api")

    fake_user = SimpleNamespace(uid="admin", role="admin", department_id=1)

    async def _fake_db() -> None:
        return None

    async def _fake_user() -> SimpleNamespace:
        return fake_user

    app.dependency_overrides[eval_module.require_knowledge_base_read] = _fake_user
    app.dependency_overrides[eval_module.require_knowledge_base_manage] = _fake_user
    app.dependency_overrides[eval_module.require_evaluation_dataset_read] = _fake_user
    app.dependency_overrides[eval_module.require_evaluation_dataset_manage] = _fake_user
    app.dependency_overrides[get_admin_user] = _fake_user
    return TestClient(app)


def test_evaluation_upload_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeEvaluationService.upload_result = _dataset()

    response = _eval_client(monkeypatch).post(
        "/api/evaluation/databases/kb-1/datasets/upload",
        data={"name": "pytest dataset", "description": ""},
        files={"file": ("d.jsonl", b'{"query":"q"}\n', "application/x-ndjson")},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": _FakeEvaluationService.upload_result}


def test_evaluation_dataset_list_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeEvaluationService.list_result = [_dataset()]

    response = _eval_client(monkeypatch).get("/api/evaluation/databases/kb-1/datasets")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": _FakeEvaluationService.list_result}


def test_evaluation_dataset_detail_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeEvaluationService.detail_result = _dataset_detail()

    response = _eval_client(monkeypatch).get("/api/evaluation/databases/kb-1/datasets/dataset_abcd1234")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": _FakeEvaluationService.detail_result}


def test_evaluation_dataset_download_is_not_json(monkeypatch: pytest.MonkeyPatch) -> None:
    """下载端点回二进制 JSONL，媒体类型不得是 application/json。"""

    _FakeEvaluationService.export_result = {"filename": "d.jsonl", "content": '{"query": "q"}\n'}

    response = _eval_client(monkeypatch).get("/api/evaluation/datasets/dataset_abcd1234/download")

    assert response.status_code == 200, response.text
    assert "application/json" not in response.headers["content-type"]
    assert "application/x-ndjson" in response.headers["content-type"]
    assert response.content == b'{"query": "q"}\n'


def test_evaluation_dataset_delete_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """删除只回 message + null data，不许被模型带上别的键。"""

    response = _eval_client(monkeypatch).delete("/api/evaluation/datasets/dataset_abcd1234")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": None}


def test_evaluation_generate_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeEvaluationService.generate_result = {
        "dataset_id": "dataset_abcd1234",
        "task_id": "task-1",
        "message": "评估数据集生成任务已提交",
    }

    response = _eval_client(monkeypatch).post(
        "/api/evaluation/databases/kb-1/datasets/generate",
        json={"llm_model_spec": "openai:gpt"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": _FakeEvaluationService.generate_result}


def test_evaluation_resume_without_task_id_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """已完成的数据集恢复时不下发 task_id，响应不得多出 null 键。"""

    _FakeEvaluationService.resume_result = {"dataset_id": "dataset_abcd1234", "message": "数据集已完成生成"}

    response = _eval_client(monkeypatch).post(
        "/api/evaluation/databases/kb-1/datasets/dataset_abcd1234/resume"
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": _FakeEvaluationService.resume_result}


def test_evaluation_resume_with_task_id_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeEvaluationService.resume_result = {
        "dataset_id": "dataset_abcd1234",
        "task_id": "task-1",
        "message": "评估数据集生成任务已恢复",
    }

    response = _eval_client(monkeypatch).post(
        "/api/evaluation/databases/kb-1/datasets/dataset_abcd1234/resume"
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": _FakeEvaluationService.resume_result}


def test_evaluation_run_create_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeEvaluationService.run_id = "run_abcd1234"

    response = _eval_client(monkeypatch).post(
        "/api/evaluation/databases/kb-1/runs",
        json={"dataset_id": "dataset_abcd1234"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": {"run_id": "run_abcd1234"}}


def test_evaluation_run_list_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeEvaluationService.list_runs_result = [_run()]

    response = _eval_client(monkeypatch).get("/api/evaluation/databases/kb-1/runs")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": _FakeEvaluationService.list_runs_result}


def test_evaluation_running_run_keeps_progress_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """运行中任务额外下发 progress/message，响应必须逐键一致。"""

    _FakeEvaluationService.list_runs_result = [
        _run(status="running", completed_at=None, overall_score=None, progress=42, message="评估 1/2")
    ]

    response = _eval_client(monkeypatch).get("/api/evaluation/databases/kb-1/runs")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": _FakeEvaluationService.list_runs_result}


def test_evaluation_run_results_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeEvaluationService.run_results_result = _run_results()

    response = _eval_client(monkeypatch).get("/api/evaluation/databases/kb-1/runs/run_abcd1234")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": _FakeEvaluationService.run_results_result}


def test_evaluation_run_results_task_branch_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    """运行未落库时只回任务进度字段，响应不得多出 null 键。"""

    _FakeEvaluationService.run_results_result = {
        "run_id": "run_abcd1234",
        "status": "running",
        "progress": 10,
        "message": "评估中",
    }

    response = _eval_client(monkeypatch).get("/api/evaluation/databases/kb-1/runs/run_abcd1234")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": _FakeEvaluationService.run_results_result}


def test_evaluation_run_delete_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    response = _eval_client(monkeypatch).delete("/api/evaluation/databases/kb-1/runs/run_abcd1234")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "success", "data": None}


# =============================================================================
# === 图谱：载荷 fixture（对齐 MilvusGraphService 与 serialize_knowledge_base） ===
# =============================================================================


_SERIALIZED_KB: dict[str, Any] = {
    "kb_id": "kb-1",
    "name": "Graph KB",
    "description": "desc",
    "kb_type": "milvus",
    "embedding_model_spec": "openai:text-embedding-3-small",
    "llm_model_spec": None,
    "query_params": {},
    "metadata": {"stats": {"file_count": 0}},
    "created_by": "admin",
    "created_at": "2026-10-16T12:00:00Z",
    "status": "已连接",
    "stats": {"file_count": 0, "chunk_count": 0},
    "row_count": 0,
    "share_config": {},
    "additional_params": {"stats": {"file_count": 0}},
}


def _graph_node() -> dict[str, Any]:
    return {
        "id": "4:abc:1",
        "name": "Alice",
        "original_id": "4:abc:1",
        "type": "Entity",
        "labels": ["Person"],
        "properties": {"entity_id": "e1", "label": "Person"},
        "normalized": {"name": "Alice", "type": "Entity", "source": "milvus"},
        "graph_type": "milvus",
    }


def _graph_edge() -> dict[str, Any]:
    return {
        "id": "5:abc:1",
        "source_id": "4:abc:1",
        "target_id": "4:abc:2",
        "type": "RELATES",
        "properties": {"weight": 1},
        "normalized": {"type": "RELATES", "direction": "directed"},
    }


class _FakeGraphService:
    """只提供被转换端点需要的读取。"""

    def __init__(self, *, kb_id: str) -> None:
        self.kb_id = kb_id

    async def query_nodes(self, **_kwargs: Any) -> dict[str, Any]:
        return {"nodes": [_graph_node()], "edges": [_graph_edge()]}

    async def get_labels(self) -> list[str]:
        return ["Person", "Org"]

    async def get_stats(self) -> dict[str, Any]:
        return {"total_nodes": 10, "total_edges": 12, "entity_types": [{"type": "Person", "count": 5}]}


class _FakeKnowledgeBase:
    async def get_databases_by_uid(self, _uid: Any) -> list[SimpleNamespace]:
        return [
            SimpleNamespace(
                kb_id="kb-1",
                name="Graph KB",
                description="desc",
                kb_type="milvus",
            ),
            SimpleNamespace(
                kb_id="kb-2",
                name="Dify KB",
                description=None,
                kb_type="dify",
            ),
        ]

    async def get_database_info(self, _kb_id: str) -> SimpleNamespace:
        return SimpleNamespace(kb_type="milvus")


def _graph_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(graph_module, "knowledge_base", _FakeKnowledgeBase())
    monkeypatch.setattr(graph_module, "MilvusGraphService", _FakeGraphService)
    monkeypatch.setattr(graph_module, "serialize_knowledge_base", lambda _db, **_kwargs: dict(_SERIALIZED_KB))

    app = FastAPI()
    app.include_router(graph_module.graph, prefix="/api")

    fake_user = SimpleNamespace(uid="admin", role="admin", department_id=1)

    async def _fake_user() -> SimpleNamespace:
        return fake_user

    app.dependency_overrides[get_admin_user] = _fake_user
    app.dependency_overrides[graph_module.require_knowledge_base_read] = _fake_user
    return TestClient(app)


def test_graph_list_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = {
        "success": True,
        "data": [
            {
                "id": "kb-1",
                "name": "Graph KB",
                "type": "milvus",
                "description": "desc",
                "status": "已连接",
                "created_at": _SERIALIZED_KB["created_at"],
                "metadata": _SERIALIZED_KB,
            }
        ],
    }

    response = _graph_client(monkeypatch).get("/api/graph/list")

    assert response.status_code == 200, response.text
    assert response.json() == expected


def test_graph_subgraph_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = {"success": True, "data": {"nodes": [_graph_node()], "edges": [_graph_edge()]}}

    response = _graph_client(monkeypatch).get("/api/graph/subgraph", params={"kb_id": "kb-1"})

    assert response.status_code == 200, response.text
    assert response.json() == expected


def test_graph_labels_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    response = _graph_client(monkeypatch).get("/api/graph/labels", params={"kb_id": "kb-1"})

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True, "data": {"labels": ["Person", "Org"]}}


def test_graph_stats_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = {
        "success": True,
        "data": {"total_nodes": 10, "total_edges": 12, "entity_types": [{"type": "Person", "count": 5}]},
    }

    response = _graph_client(monkeypatch).get("/api/graph/stats", params={"kb_id": "kb-1"})

    assert response.status_code == 200, response.text
    assert response.json() == expected


# =============================================================================
# === 负向守卫 ===
# =============================================================================


class _NarrowDatasetItem(BaseModel):
    """故意只覆盖少数字段的模型，用来证明字段覆盖检查不是恒真。"""

    dataset_id: str
    name: str


def test_contract_guard_reports_fields_the_model_omits() -> None:
    missing = uncovered_paths(_dataset(), _NarrowDatasetItem)

    assert "build_metadata" in missing
    assert "has_gold_chunks" in missing
    assert "updated_at" in missing


def test_contract_guard_accepts_covering_models() -> None:
    """模型覆盖完整时覆盖检查为空，否则守卫会永远失败。"""

    assert uncovered_paths(_dataset(), eval_module.EvaluationDatasetItem) == []
    assert uncovered_paths(_dataset_detail(), eval_module.EvaluationDatasetDetailItem) == []
    assert uncovered_paths(_run(), eval_module.EvaluationRunItem) == []
    assert uncovered_paths(_run_results(), eval_module.EvaluationRunResultData) == []
    assert uncovered_paths(_graph_node(), graph_module.GraphNode) == []
    assert uncovered_paths(_graph_edge(), graph_module.GraphEdge) == []
