from __future__ import annotations

from types import SimpleNamespace
from pathlib import Path

import pytest

from ars.services import ocr_service
from ars.agents.toolkits.buildin import tools as buildin_tools
from ars.agents.toolkits.buildin.tools import ocr_parse_file

pytestmark = pytest.mark.unit


def _patch_sandbox_backend(monkeypatch: pytest.MonkeyPatch, files: dict[str, bytes]):
    class FakeBackend:
        def __init__(self, **kwargs):
            self.scope = kwargs

        def download_authorized_file_to_path(self, path, target_path, max_bytes):
            if path not in files:
                raise ValueError("not a regular file")
            content = files[path]
            assert len(content) <= max_bytes
            Path(target_path).write_bytes(content)
            return len(content)

        def regular_file_exists(self, path):
            return path in files

        def upload_authorized_file_from_path(self, path, source_path):
            files[path] = Path(source_path).read_bytes()

    monkeypatch.setattr(buildin_tools, "ProvisionerSandboxBackend", FakeBackend, raising=False)
    return files


def _runtime(
    *,
    thread_id: str = "thread-1",
    uid: str = "user-1",
) -> SimpleNamespace:
    configurable = {
        "thread_id": thread_id,
        "runtime_scope_id": thread_id,
        "workdir_relative_path": "projects/11111111-1111-4111-8111-111111111111",
        "workdir_path": "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111",
        "uid": uid,
    }
    return SimpleNamespace(
        config={"configurable": configurable},
        context=SimpleNamespace(
            thread_id=thread_id,
            runtime_scope_id=thread_id,
            workdir_relative_path="projects/11111111-1111-4111-8111-111111111111",
            workdir_path="/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111",
            uid=uid,
        ),
        state={},
    )


@pytest.mark.asyncio
async def test_ocr_parse_file_writes_markdown_to_outputs(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    _mock_system_options(monkeypatch)

    def resolve_engine(engine_id, default_engine):
        del default_engine
        return engine_id

    monkeypatch.setattr(ocr_service, "resolve_ocr_engine_id", resolve_engine)
    thread_id = "thread-1"
    uid = "user-1"
    source_virtual_path = "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/scan.png"
    sandbox_files = _patch_sandbox_backend(monkeypatch, {source_virtual_path: b"fake image"})
    captured: dict[str, object] = {}

    async def fake_parse_document(source: str, params: dict | None = None, db=None) -> str:
        del db
        captured["source"] = source
        captured["params"] = params
        return "识别结果\n" + ("长文本" * 500)

    monkeypatch.setattr(ocr_service, "parse_document", fake_parse_document)

    result = await ocr_parse_file.coroutine(
        file_path=source_virtual_path,
        ocr_engine="mineru_ocr",
        runtime=_runtime(thread_id=thread_id, uid=uid),
    )

    output_virtual_path = "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/outputs/ocr/scan.md"
    assert sandbox_files[output_virtual_path].decode("utf-8").startswith("识别结果")
    assert result["source_path"] == source_virtual_path
    assert result["parsed_path"] == output_virtual_path
    assert result["ocr_engine"] == "mineru_ocr"
    assert result["char_count"] == len(sandbox_files[output_virtual_path].decode("utf-8"))
    assert result["truncated"] is True
    assert len(result["preview"]) <= 1200
    assert Path(str(captured["source"])).suffix == ".png"
    assert captured["params"] == {"ocr_engine": "mineru_ocr"}


@pytest.mark.asyncio
async def test_ocr_parse_file_uses_default_engine(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    _mock_system_options(monkeypatch)

    def resolve_engine(engine_id, default_engine):
        assert engine_id is None
        assert default_engine == "rapid_ocr"
        return "rapid_ocr"

    monkeypatch.setattr(ocr_service, "resolve_ocr_engine_id", resolve_engine)
    thread_id = "thread-1"
    uid = "user-1"
    source_virtual_path = "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/uploads/upload.pdf"
    _patch_sandbox_backend(monkeypatch, {source_virtual_path: b"fake pdf"})
    captured: dict[str, object] = {}

    async def fake_parse_document(source: str, params: dict | None = None, db=None) -> str:
        del source, db
        captured["params"] = params
        return "OCR content"

    monkeypatch.setattr(ocr_service, "parse_document", fake_parse_document)

    result = await ocr_parse_file.coroutine(
        file_path=source_virtual_path,
        runtime=_runtime(thread_id=thread_id, uid=uid),
    )

    assert result["ocr_engine"] == "rapid_ocr"
    assert captured["params"] == {"ocr_engine": "rapid_ocr"}


@pytest.mark.asyncio
async def test_ocr_parse_file_accepts_disable_for_pdf(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    _mock_system_options(monkeypatch)
    thread_id = "thread-1"
    uid = "user-1"
    source_virtual_path = "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/uploads/text-layer.pdf"
    _patch_sandbox_backend(monkeypatch, {source_virtual_path: b"fake pdf"})
    captured: dict[str, object] = {}

    async def fake_parse_document(source: str, params: dict | None = None, db=None) -> str:
        del source, db
        captured["params"] = params
        return "PDF text layer"

    monkeypatch.setattr(ocr_service, "parse_document", fake_parse_document)

    result = await ocr_parse_file.coroutine(
        file_path=source_virtual_path,
        ocr_engine="disable",
        runtime=_runtime(thread_id=thread_id, uid=uid),
    )

    assert result["ocr_engine"] == "disable"
    assert captured["params"] == {"ocr_engine": "disable"}


@pytest.mark.asyncio
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "file_path",
    [
        "/etc/passwd",
        "/home/gem/user-data/../secrets.png",
    ],
)
async def test_ocr_parse_file_rejects_path_outside_user_data(
    tmp_path, monkeypatch: pytest.MonkeyPatch, file_path: str
) -> None:
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    _mock_system_options(monkeypatch)

    with pytest.raises(ValueError, match="只允许解析"):
        await ocr_parse_file.coroutine(file_path=file_path, runtime=_runtime())


@pytest.mark.asyncio
async def test_ocr_parse_file_rejects_directory(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "threads"))
    _mock_system_options(monkeypatch)
    thread_id = "thread-1"
    uid = "user-1"
    dir_virtual_path = "/home/gem/user-data/projects/11111111-1111-4111-8111-111111111111/directory"
    _patch_sandbox_backend(monkeypatch, {})

    with pytest.raises(ValueError, match="不存在或不是普通文件"):
        await ocr_parse_file.coroutine(file_path=dir_virtual_path, runtime=_runtime(thread_id=thread_id, uid=uid))


def _mock_system_options(monkeypatch: pytest.MonkeyPatch) -> None:
    from ars.config.options import Option, system_options

    async def get_options(option, _db=None):
        assert option is system_options
        return {"default_ocr_engine": "rapid_ocr"}

    monkeypatch.setattr(Option, "get", get_options)
