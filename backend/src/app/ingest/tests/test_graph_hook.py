"""建图钩子测试（D62）：默认关闭、失败隔离。

这个钩子挂在**用户可见的摄取主链路**上，所以两条性质必须钉死：

- **默认关闭**：开启前用户行为与改造前逐位一致；
- **失败绝不外溢**：建图是可选增值，派发失败不能让一次成功的摄取变成失败。
"""

from __future__ import annotations

import pytest

from backend.src.app.ingest.tasks import graph_hook
from backend.src.core.config import settings


class _FakeCelery:
    def __init__(self, *, raises: Exception | None = None) -> None:
        self.raises = raises
        self.sent: list[tuple[str, dict]] = []

    def send_task(self, name: str, **kwargs: object) -> None:
        if self.raises is not None:
            raise self.raises
        self.sent.append((name, dict(kwargs.get('kwargs') or {})))  # type: ignore[arg-type]


@pytest.fixture
def fake_celery(monkeypatch: pytest.MonkeyPatch) -> _FakeCelery:
    fake = _FakeCelery()
    import backend.src.app.task.celery as celery_module

    monkeypatch.setattr(celery_module, 'celery_app', fake, raising=False)
    return fake


def test_disabled_by_default_sends_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    """出厂默认关闭：不改任何既有部署的行为。"""
    monkeypatch.setattr(settings, 'RAGF_GRAPH_AUTO_BUILD', False)
    fake = _FakeCelery()
    import backend.src.app.task.celery as celery_module

    monkeypatch.setattr(celery_module, 'celery_app', fake, raising=False)
    graph_hook.enqueue_graph_build(document_id='d1', kb_name='dev')
    assert fake.sent == []


def test_enabled_dispatches_named_task(monkeypatch: pytest.MonkeyPatch, fake_celery: _FakeCelery) -> None:
    monkeypatch.setattr(settings, 'RAGF_GRAPH_AUTO_BUILD', True)
    graph_hook.enqueue_graph_build(document_id='d1', kb_name='dev', plugin_namespace='core')
    assert fake_celery.sent == [
        ('graph.build_document', {'document_id': 'd1', 'kb_name': 'dev', 'plugin_namespace': 'core'})
    ]


def test_dispatch_failure_does_not_raise(monkeypatch: pytest.MonkeyPatch) -> None:
    """派发失败只告警——绝不能把一次成功的摄取变成失败。"""
    monkeypatch.setattr(settings, 'RAGF_GRAPH_AUTO_BUILD', True)
    broken = _FakeCelery(raises=ConnectionError('broker 不可达'))
    import backend.src.app.task.celery as celery_module

    monkeypatch.setattr(celery_module, 'celery_app', broken, raising=False)
    graph_hook.enqueue_graph_build(document_id='d1', kb_name='dev')  # 不抛即通过


def test_hook_does_not_import_graph_domain() -> None:
    """钩子按任务名派发而非 import 图谱域——这样不需要新增跨域契约豁免。"""
    import ast
    import pathlib

    source = pathlib.Path(graph_hook.__file__).read_text()
    imported = {node.module or '' for node in ast.walk(ast.parse(source)) if isinstance(node, ast.ImportFrom)}
    assert not any('app.graph' in module for module in imported), '钩子不应 import 图谱域'
