"""user / workspace / viewer-filesystem 端点的响应契约。

`response_model` 会按模型裁剪响应体：模型漏字段就会静默丢数据；声明了「有时不下发」的
字段又会让响应多出 null 键。因此每个被转换端点都断言「响应 JSON == handler 装配出的
载荷」，这一个断言同时守住丢字段与多键两个方向，是本次补 schema 的 oracle。

纯流端点（download）没有 JSON 载荷，改为断言流字节与媒体类型，证明补 `response_class`
没有改变行为；file 预览这类混合形状端点分别覆盖 JSON 与流两条分支。
"""

from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any, ClassVar

import pytest
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel

from server.utils.auth_middleware import get_db, get_required_user
from test.support.response_contract import uncovered_paths

pytestmark = pytest.mark.unit

user_router_module = importlib.import_module("server.routers.user_router")
workspace_router_module = importlib.import_module("server.routers.workspace_router")
filesystem_router_module = importlib.import_module("server.routers.filesystem_router")
knowledge_preview_module = importlib.import_module("ars.knowledge.preview")


# --------------------------------------------------------------------------
# user 路由
# --------------------------------------------------------------------------


def _user_config_payload() -> dict[str, Any]:
    """`UserConfig.dump_config()` 的真实输出。"""

    return {"uid": "user_a", "enable_memory": True, "updated_at": "2026-06-20T01:00:00Z"}


def _api_key_item(**overrides: Any) -> dict[str, Any]:
    """`APIKey.to_dict()` 的真实输出。"""

    item: dict[str, Any] = {
        "id": 5,
        "key_prefix": "ars_abcd1234",
        "name": "ci key",
        "user_id": 3,
        "department_id": None,
        "expires_at": None,
        "is_enabled": True,
        "last_used_at": "2026-06-20T02:00:00Z",
        "created_by": "3",
        "created_at": "2026-06-15T08:30:00Z",
    }
    item.update(overrides)
    return item


class _FakeKey:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def to_dict(self) -> dict[str, Any]:
        return dict(self._payload)


class _FakeUserConfig:
    """替代 `ars.config.UserConfig`，只回放固定 dump_config 载荷。"""

    payload: ClassVar[dict[str, Any]] = {}

    def __init__(self, uid: str, schema: object = None) -> None:
        self.uid = uid
        self.schema = schema

    @classmethod
    async def load(cls, _db: object, uid: str) -> _FakeUserConfig:
        return cls(uid)

    async def save(self, _db: object) -> _FakeUserConfig:
        return self

    def dump_config(self) -> dict[str, Any]:
        return dict(type(self).payload)


class _FakeAPIKeyRepository:
    items: ClassVar[list[dict[str, Any]]] = []
    total: ClassVar[int] = 0

    def __init__(self, _db: object) -> None:
        pass

    async def list_visible(self, **_kwargs: object) -> tuple[list[_FakeKey], int]:
        return [_FakeKey(item) for item in type(self).items], type(self).total

    async def get_accessible(self, **_kwargs: object) -> SimpleNamespace:
        api_key = _FakeKey(type(self).items[0]) if type(self).items else None
        return SimpleNamespace(api_key=api_key, exists=True)

    async def update(self, api_key: _FakeKey, _updates: dict[str, Any]) -> _FakeKey:
        return api_key

    async def delete(self, _api_key: _FakeKey) -> None:
        return None


def _user_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(user_router_module, "UserConfig", _FakeUserConfig)
    monkeypatch.setattr(user_router_module, "APIKeyRepository", _FakeAPIKeyRepository)

    async def _fake_upload_image(_file: object, **_kwargs: object) -> str:
        return "images/user_a/pic.png"

    monkeypatch.setattr(user_router_module, "upload_image_to_minio", _fake_upload_image)

    app = FastAPI()
    app.include_router(user_router_module.user_router, prefix="/api")

    fake_user = SimpleNamespace(id=3, uid="user_a", role="admin", department_id=1)

    async def _fake_db() -> None:
        return None

    async def _fake_user() -> SimpleNamespace:
        return fake_user

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    app.dependency_overrides[user_router_module.get_logged_in_user] = _fake_user
    return TestClient(app)


def test_get_user_config_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeUserConfig.payload = _user_config_payload()

    response = _user_client(monkeypatch).get("/api/user/config")

    assert response.status_code == 200, response.text
    assert response.json() == _FakeUserConfig.payload


def test_put_user_config_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeUserConfig.payload = _user_config_payload()

    response = _user_client(monkeypatch).put("/api/user/config", json={"enable_memory": True})

    assert response.status_code == 200, response.text
    assert response.json() == _FakeUserConfig.payload


def test_upload_image_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    response = _user_client(monkeypatch).post(
        "/api/user/upload-image",
        files={"file": ("pic.png", b"image-bytes", "image/png")},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "success": True,
        "image_url": "images/user_a/pic.png",
        "url": "images/user_a/pic.png",
    }


def test_list_api_keys_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeAPIKeyRepository.items = [_api_key_item(id=5), _api_key_item(id=6, name="second")]
    _FakeAPIKeyRepository.total = 2

    response = _user_client(monkeypatch).get("/api/user/apikey/")

    assert response.status_code == 200, response.text
    assert response.json() == {"api_keys": list(_FakeAPIKeyRepository.items), "total": 2}


def test_get_api_key_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeAPIKeyRepository.items = [_api_key_item()]

    response = _user_client(monkeypatch).get("/api/user/apikey/5")

    assert response.status_code == 200, response.text
    assert response.json() == {"api_key": _api_key_item()}


def test_update_api_key_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeAPIKeyRepository.items = [_api_key_item(name="renamed")]

    response = _user_client(monkeypatch).put("/api/user/apikey/5", json={"name": "renamed"})

    assert response.status_code == 200, response.text
    assert response.json() == {"api_key": _api_key_item(name="renamed")}


def test_delete_api_key_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    _FakeAPIKeyRepository.items = [_api_key_item()]

    response = _user_client(monkeypatch).delete("/api/user/apikey/5")

    assert response.status_code == 200, response.text
    assert response.json() == {"success": True}


# --------------------------------------------------------------------------
# workspace 路由
# --------------------------------------------------------------------------


def _workspace_entry(**overrides: Any) -> dict[str, Any]:
    """`workspace_service._entry_from_metadata` 的真实输出。"""

    entry: dict[str, Any] = {
        "path": "/notes/",
        "virtual_path": "/home/gem/user-data/notes/",
        "name": "notes",
        "is_dir": True,
        "size": 0,
        "modified_at": "",
    }
    entry.update(overrides)
    return entry


def _workspace_preview_payload() -> dict[str, Any]:
    """`PreviewResult.payload()` 的真实输出（文本预览分支）。"""

    return {
        "content": "hello world",
        "preview_type": "text",
        "supported": True,
        "message": None,
        "truncated": False,
        "limit": 250000,
    }


def _knowledge_entry(**overrides: Any) -> dict[str, Any]:
    """`_workspace_knowledge_entry` 的真实输出。"""

    entry: dict[str, Any] = {
        "source": "knowledge",
        "kb_id": "kb_1",
        "file_id": "file_1",
        "parent_id": None,
        "path": "/knowledge/kb_1/file/file_1",
        "virtual_path": "/knowledge/kb_1/file/file_1",
        "name": "alpha.pdf",
        "is_dir": False,
        "size": 2048,
        "modified_at": "2026-06-20T01:00:00Z",
        "readonly": True,
        "status": "indexed",
        "has_original_file": True,
        "has_parsed_markdown": True,
        "is_virtual_folder": False,
        "path_prefix": "",
    }
    entry.update(overrides)
    return entry


class _FakeKnowledgeBase:
    """只实现 workspace 知识只读视图用到的读能力。"""

    def __init__(self, items: list[dict[str, Any]]) -> None:
        self._items = items

    async def list_document_files(self, **kwargs: Any) -> dict[str, Any]:
        return {
            "items": list(self._items),
            "page": kwargs["page"],
            "page_size": kwargs["page_size"],
            "total": len(self._items),
            "has_more": False,
            "parent_id": kwargs["parent_id"],
            "path_prefix": kwargs["path_prefix"] or "",
        }

    async def get_file_download(self, **_kwargs: Any) -> dict[str, Any]:
        return {"filename": "alpha.pdf", "content": b"%PDF-DATA", "media_type": "application/pdf"}


def _workspace_client(monkeypatch: pytest.MonkeyPatch, *, kb: _FakeKnowledgeBase | None = None) -> TestClient:
    app = FastAPI()
    app.include_router(workspace_router_module.workspace, prefix="/api")
    app.include_router(workspace_router_module.workspace_knowledge, prefix="/api")

    async def _fake_db() -> None:
        return None

    async def _fake_user() -> SimpleNamespace:
        return SimpleNamespace(uid="user_a", role="user", department_id=1)

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user

    if kb is not None:
        monkeypatch.setattr(workspace_router_module, "_get_knowledge_base", lambda: kb)

    async def _noop_access(_user: object, _kb_id: str) -> None:
        return None

    async def _noop_supports(_kb_id: str) -> None:
        return None

    monkeypatch.setattr(workspace_router_module, "_ensure_knowledge_read_access", _noop_access)
    monkeypatch.setattr(workspace_router_module, "_ensure_knowledge_supports_documents", _noop_supports)
    return TestClient(app)


def test_workspace_tree_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"entries": [_workspace_entry()]}

    async def _fake_tree(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(workspace_router_module, "list_workspace_tree", _fake_tree)

    response = _workspace_client(monkeypatch).get("/api/workspace/tree")

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_workspace_search_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"entries": [_workspace_entry(path="/a.txt", name="a.txt", is_dir=False, size=12)]}

    async def _fake_search(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(workspace_router_module, "search_workspace_files", _fake_search)

    response = _workspace_client(monkeypatch).get("/api/workspace/search", params={"query": "a"})

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_workspace_file_json_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _workspace_preview_payload()

    async def _fake_read(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(workspace_router_module, "read_workspace_file_content", _fake_read)

    response = _workspace_client(monkeypatch).get("/api/workspace/file", params={"path": "/a.txt"})

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_workspace_file_stream_branch_passes_through(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_read(**_kwargs: object) -> StreamingResponse:
        return StreamingResponse(iter([b"%PDF-DATA"]), media_type="application/pdf")

    monkeypatch.setattr(workspace_router_module, "read_workspace_file_content", _fake_read)

    response = _workspace_client(monkeypatch).get("/api/workspace/file", params={"path": "/a.pdf"})

    assert response.status_code == 200, response.text
    assert response.content == b"%PDF-DATA"
    assert response.headers["content-type"].startswith("application/pdf")


def test_workspace_update_file_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"success": True, "path": "/a.txt", "entry": _workspace_entry(path="/a.txt")}

    async def _fake_write(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(workspace_router_module, "write_workspace_file_content", _fake_write)

    response = _workspace_client(monkeypatch).put("/api/workspace/file", json={"path": "/a.txt", "content": "x"})

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_workspace_delete_file_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"success": True, "path": "/a.txt"}

    async def _fake_delete(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(workspace_router_module, "delete_workspace_path", _fake_delete)

    response = _workspace_client(monkeypatch).delete("/api/workspace/file", params={"path": "/a.txt"})

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_workspace_create_directory_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"success": True, "entry": _workspace_entry(path="/new/", name="new")}

    async def _fake_create(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(workspace_router_module, "create_workspace_directory", _fake_create)

    response = _workspace_client(monkeypatch).post("/api/workspace/directory", json={"parent_path": "/", "name": "new"})

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_workspace_upload_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"success": True, "entries": [_workspace_entry(path="/a.txt", is_dir=False, size=3)]}

    async def _fake_upload(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(workspace_router_module, "upload_workspace_files", _fake_upload)

    response = _workspace_client(monkeypatch).post(
        "/api/workspace/upload",
        data={"parent_path": "/"},
        files={"files": ("a.txt", b"xyz", "text/plain")},
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_workspace_knowledge_tree_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    kb = _FakeKnowledgeBase(
        [
            {
                "file_id": "file_1",
                "filename": "alpha.pdf",
                "status": "indexed",
                "is_folder": False,
                "parent_id": None,
                "is_virtual_folder": False,
                "path_prefix": None,
                "updated_at": "2026-06-20T01:00:00Z",
                "created_at": "2026-06-20T00:00:00Z",
                "file_size": 2048,
                "has_original_file": True,
                "has_parsed_markdown": True,
            }
        ]
    )
    expected = {
        "entries": [_knowledge_entry()],
        "readonly": True,
        "page": 1,
        "page_size": 100,
        "total": 1,
        "has_more": False,
        "parent_id": None,
        "path_prefix": "",
    }

    response = _workspace_client(monkeypatch, kb=kb).get("/api/workspace/knowledge/tree", params={"kb_id": "kb_1"})

    assert response.status_code == 200, response.text
    assert response.json() == expected


def test_workspace_knowledge_file_json_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "source": "knowledge",
        "kb_id": "kb_1",
        "file_id": "file_1",
        "filename": "alpha.txt",
        "readonly": True,
        "content": "hello",
        "preview_type": "text",
        "supported": True,
        "message": None,
        "truncated": False,
        "limit": 250000,
    }

    async def _fake_preview(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(knowledge_preview_module, "read_knowledge_file_preview", _fake_preview)

    response = _workspace_client(monkeypatch).get(
        "/api/workspace/knowledge/file", params={"kb_id": "kb_1", "file_id": "file_1"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_workspace_knowledge_file_omits_unset_optional_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """没有原始内容的分支不带 truncated/limit，模型不许补出 null 键。"""

    payload = {
        "source": "knowledge",
        "kb_id": "kb_1",
        "file_id": "file_1",
        "filename": "alpha.txt",
        "readonly": True,
        "content": None,
        "preview_type": "unsupported",
        "supported": False,
        "message": "文件没有可预览的原始内容",
    }

    async def _fake_preview(**_kwargs: object) -> dict[str, Any]:
        return payload

    monkeypatch.setattr(knowledge_preview_module, "read_knowledge_file_preview", _fake_preview)

    response = _workspace_client(monkeypatch).get(
        "/api/workspace/knowledge/file", params={"kb_id": "kb_1", "file_id": "file_1"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_workspace_knowledge_file_binary_branch_stays_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_preview(**_kwargs: object) -> dict[str, Any]:
        return {
            "source": "knowledge",
            "kb_id": "kb_1",
            "file_id": "file_1",
            "filename": "pic.png",
            "readonly": True,
            "content": b"\x89PNG-bytes",
            "media_type": "image/png",
            "preview_type": "image",
            "supported": True,
            "message": None,
            "binary": True,
        }

    monkeypatch.setattr(knowledge_preview_module, "read_knowledge_file_preview", _fake_preview)

    response = _workspace_client(monkeypatch).get(
        "/api/workspace/knowledge/file", params={"kb_id": "kb_1", "file_id": "file_1"}
    )

    assert response.status_code == 200, response.text
    assert response.content == b"\x89PNG-bytes"
    assert response.headers["content-type"].startswith("image/png")
    assert response.headers["x-ars-preview-type"] == "image"


def test_workspace_download_is_file_response(monkeypatch: pytest.MonkeyPatch, tmp_path: object) -> None:
    target = tmp_path / "a.txt"  # type: ignore[operator]
    target.write_bytes(b"download-bytes")

    async def _fake_download(**_kwargs: object) -> FileResponse:
        return FileResponse(target, media_type="text/plain")

    monkeypatch.setattr(workspace_router_module, "download_workspace_file", _fake_download)

    response = _workspace_client(monkeypatch).get("/api/workspace/download", params={"path": "/a.txt"})

    assert response.status_code == 200, response.text
    assert response.content == b"download-bytes"


def test_workspace_knowledge_download_is_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    kb = _FakeKnowledgeBase([])

    response = _workspace_client(monkeypatch, kb=kb).get(
        "/api/workspace/knowledge/download", params={"kb_id": "kb_1", "file_id": "file_1"}
    )

    assert response.status_code == 200, response.text
    assert response.content == b"%PDF-DATA"
    assert response.headers["content-type"].startswith("application/pdf")


# --------------------------------------------------------------------------
# viewer filesystem 路由
# --------------------------------------------------------------------------


def _viewer_file_entry(**overrides: Any) -> dict[str, Any]:
    """`viewer_filesystem_service._entry` 的文件条目输出。"""

    entry: dict[str, Any] = {
        "path": "/live.txt",
        "name": "live.txt",
        "is_dir": False,
        "size": 10,
        "modified_at": "2026-06-20T01:00:00Z",
        "artifact_url": "/api/chat/thread/t1/artifacts/home/gem/user-data/projects/p/live.txt",
    }
    entry.update(overrides)
    return entry


def _viewer_preview_payload() -> dict[str, Any]:
    return {
        "content": "live bytes\n",
        "preview_type": "text",
        "supported": True,
        "message": None,
        "truncated": False,
        "limit": 250000,
    }


def _filesystem_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    app = FastAPI()
    app.include_router(filesystem_router_module.filesystem_router, prefix="/api")

    async def _fake_db() -> None:
        return None

    async def _fake_user() -> SimpleNamespace:
        return SimpleNamespace(uid="user_a", role="user", department_id=1)

    app.dependency_overrides[get_db] = _fake_db
    app.dependency_overrides[get_required_user] = _fake_user
    return TestClient(app)


def _patch_viewer(mapping: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    for name, func in mapping.items():
        monkeypatch.setattr(filesystem_router_module, name, func)


def test_viewer_tree_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"entries": [_viewer_file_entry()]}

    async def _fake_tree(**_kwargs: object) -> dict[str, Any]:
        return payload

    _patch_viewer({"list_viewer_filesystem_tree": _fake_tree}, monkeypatch)

    response = _filesystem_client(monkeypatch).get(
        "/api/viewer/filesystem/tree", params={"thread_id": "t1", "path": "/"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_viewer_search_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"entries": [_viewer_file_entry()]}

    async def _fake_search(**_kwargs: object) -> dict[str, Any]:
        return payload

    _patch_viewer({"search_viewer_files": _fake_search}, monkeypatch)

    response = _filesystem_client(monkeypatch).get(
        "/api/viewer/filesystem/search", params={"thread_id": "t1", "query": "live"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_viewer_file_json_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _viewer_preview_payload()

    async def _fake_read(**_kwargs: object) -> dict[str, Any]:
        return payload

    _patch_viewer({"read_viewer_file_content": _fake_read}, monkeypatch)

    response = _filesystem_client(monkeypatch).get(
        "/api/viewer/filesystem/file", params={"thread_id": "t1", "path": "/live.txt"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_viewer_file_stream_branch_passes_through(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_read(**_kwargs: object) -> StreamingResponse:
        return StreamingResponse(iter([b"%PDF-DATA"]), media_type="application/pdf")

    _patch_viewer({"read_viewer_file_content": _fake_read}, monkeypatch)

    response = _filesystem_client(monkeypatch).get(
        "/api/viewer/filesystem/file", params={"thread_id": "t1", "path": "/doc.pdf"}
    )

    assert response.status_code == 200, response.text
    assert response.content == b"%PDF-DATA"
    assert response.headers["content-type"].startswith("application/pdf")


def test_viewer_delete_file_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"success": True, "path": "/live.txt"}

    async def _fake_delete(**_kwargs: object) -> dict[str, Any]:
        return payload

    _patch_viewer({"delete_viewer_file": _fake_delete}, monkeypatch)

    response = _filesystem_client(monkeypatch).delete(
        "/api/viewer/filesystem/file", params={"thread_id": "t1", "path": "/live.txt"}
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_viewer_create_directory_response_omits_artifact_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """创建目录条目不返回 artifact_url，模型不许补出 null 键。"""

    payload = {
        "entry": {
            "path": "/new/",
            "name": "new",
            "is_dir": True,
            "size": 0,
            "modified_at": "",
        }
    }

    async def _fake_create(**_kwargs: object) -> dict[str, Any]:
        return payload

    _patch_viewer({"create_viewer_directory": _fake_create}, monkeypatch)

    response = _filesystem_client(monkeypatch).post(
        "/api/viewer/filesystem/directory",
        json={"thread_id": "t1", "parent_path": "/", "name": "new"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_viewer_upload_response_equals_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"entries": [_viewer_file_entry()]}

    async def _fake_upload(**_kwargs: object) -> dict[str, Any]:
        return payload

    _patch_viewer({"upload_viewer_files": _fake_upload}, monkeypatch)

    response = _filesystem_client(monkeypatch).post(
        "/api/viewer/filesystem/upload",
        data={"thread_id": "t1", "parent_path": "/"},
        files={"files": ("live.txt", b"live bytes\n", "text/plain")},
    )

    assert response.status_code == 200, response.text
    assert response.json() == payload


def test_viewer_download_is_file_response(monkeypatch: pytest.MonkeyPatch, tmp_path: object) -> None:
    target = tmp_path / "live.txt"  # type: ignore[operator]
    target.write_bytes(b"live bytes\n")

    async def _fake_download(**_kwargs: object) -> FileResponse:
        return FileResponse(target, media_type="text/plain")

    _patch_viewer({"download_viewer_file": _fake_download}, monkeypatch)

    response = _filesystem_client(monkeypatch).get(
        "/api/viewer/filesystem/download", params={"thread_id": "t1", "path": "/live.txt"}
    )

    assert response.status_code == 200, response.text
    assert response.content == b"live bytes\n"


# --------------------------------------------------------------------------
# 守卫：证明字段覆盖检查不是恒真，且已声明模型确实覆盖载荷
# --------------------------------------------------------------------------


class _NarrowViewerEntry(BaseModel):
    """故意只覆盖一个字段，用来证明覆盖检查会发现漏字段。"""

    name: str


def test_contract_guard_reports_fields_the_model_omits() -> None:
    missing = uncovered_paths(_viewer_file_entry(), _NarrowViewerEntry)

    assert "artifact_url" in missing
    assert "is_dir" in missing
    assert "modified_at" in missing


def test_contract_guard_accepts_covering_models() -> None:
    assert uncovered_paths(_viewer_file_entry(), filesystem_router_module.ViewerEntryItem) == []
    assert (
        uncovered_paths(
            {"entry": {"path": "/n/", "name": "n", "is_dir": True, "size": 0, "modified_at": ""}},
            filesystem_router_module.ViewerDirectoryCreateResponse,
        )
        == []
    )
    assert uncovered_paths(_workspace_entry(), workspace_router_module.WorkspaceEntryItem) == []
    assert uncovered_paths(_workspace_preview_payload(), workspace_router_module.WorkspaceFilePreviewResponse) == []
    assert uncovered_paths(_knowledge_entry(), workspace_router_module.WorkspaceKnowledgeEntryItem) == []
    assert uncovered_paths(_api_key_item(), user_router_module.APIKeyResponse) == []
