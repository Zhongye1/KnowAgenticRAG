from __future__ import annotations

import json
import os
import subprocess
import sys
from types import SimpleNamespace

import pytest
from ars.knowledge.manager import KnowledgeBaseManager

pytestmark = pytest.mark.unit


def test_knowledge_runtime_preserves_lite_mode(tmp_path):
    env = os.environ.copy()
    env["LITE_MODE"] = "1"
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import json; from ars.knowledge.runtime import knowledge_base; "
                "from ars.knowledge.factory import KnowledgeBaseFactory; "
                "print(json.dumps({"
                "'manager': type(knowledge_base).__name__, "
                "'types': sorted(KnowledgeBaseFactory.get_available_types())"
                "}))"
            ),
        ],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )

    loaded = json.loads(result.stdout.splitlines()[-1])
    assert loaded == {"manager": "KnowledgeBaseManager", "types": ["dify", "notion"]}


@pytest.mark.asyncio
async def test_initialize_creates_executors_without_loading_all_configs(monkeypatch):
    """initialize() 只创建已使用类型的执行器，不加载全部 KB 配置。"""
    manager = KnowledgeBaseManager("/tmp/ars-test")

    async def fake_get_all(_self):
        return [
            SimpleNamespace(kb_id="kb_1", kb_type="milvus"),
        ]

    fake_instance = SimpleNamespace()

    def fake_create(_kb_type, _work_dir):
        return fake_instance

    monkeypatch.setattr(
        "ars.repositories.knowledge_base_repository.KnowledgeBaseRepository.get_all",
        fake_get_all,
    )
    monkeypatch.setattr(
        "ars.knowledge.manager.KnowledgeBaseFactory.is_type_supported",
        classmethod(lambda cls, _kb_type: True),
    )
    monkeypatch.setattr(
        "ars.knowledge.manager.KnowledgeBaseFactory.create",
        staticmethod(fake_create),
    )

    await manager.initialize()

    assert "milvus" in manager.kb_instances


@pytest.mark.asyncio
async def test_initialize_propagates_failure_from_backend_already_in_use(monkeypatch, tmp_path):
    manager = KnowledgeBaseManager(str(tmp_path))

    async def fake_get_all(_self):
        return [SimpleNamespace(kb_id="kb_1", kb_type="milvus")]

    def fail_create(_kb_type, _work_dir):
        raise ConnectionError("milvus unavailable")

    monkeypatch.setattr(
        "ars.repositories.knowledge_base_repository.KnowledgeBaseRepository.get_all",
        fake_get_all,
    )
    monkeypatch.setattr(
        "ars.knowledge.manager.KnowledgeBaseFactory.is_type_supported",
        classmethod(lambda cls, _kb_type: True),
    )
    monkeypatch.setattr(
        "ars.knowledge.manager.KnowledgeBaseFactory.create",
        staticmethod(fail_create),
    )

    with pytest.raises(RuntimeError, match="milvus:ConnectionError"):
        await manager.initialize()


@pytest.mark.asyncio
async def test_initialize_rejects_persisted_unsupported_backend(monkeypatch, tmp_path):
    manager = KnowledgeBaseManager(str(tmp_path))

    async def fake_get_all(_self):
        return [SimpleNamespace(kb_id="kb_legacy", kb_type="removed-backend")]

    monkeypatch.setattr(
        "ars.repositories.knowledge_base_repository.KnowledgeBaseRepository.get_all",
        fake_get_all,
    )

    with pytest.raises(RuntimeError, match="removed-backend:unsupported"):
        await manager.initialize()
