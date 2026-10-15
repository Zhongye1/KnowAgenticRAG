import pytest

from ars.utils import guard as guard_module


def test_configured_content_guard_does_not_mutate_global_instance(monkeypatch: pytest.MonkeyPatch):
    model = object()
    monkeypatch.setattr(guard_module, "select_model", lambda *, model_spec: model)
    content_guard = guard_module.ContentGuard.__new__(guard_module.ContentGuard)
    content_guard.keywords = ["blocked"]
    content_guard.enable_llm = False
    content_guard.llm_model_spec = ""
    content_guard.llm_model = None

    request_guard = content_guard.configured(True, "provider:model")

    assert request_guard is not content_guard
    assert request_guard.keywords is content_guard.keywords
    assert request_guard.enable_llm is True
    assert request_guard.llm_model_spec == "provider:model"
    assert request_guard.llm_model is model
    assert content_guard.enable_llm is False
    assert content_guard.llm_model is None


def test_disabled_content_guard_does_not_load_model(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        guard_module,
        "select_model",
        lambda **_kwargs: pytest.fail("disabled guard must not load a model"),
    )
    content_guard = guard_module.ContentGuard.__new__(guard_module.ContentGuard)
    content_guard.keywords = []
    content_guard.enable_llm = False
    content_guard.llm_model_spec = ""
    content_guard.llm_model = None

    request_guard = content_guard.configured(False, "missing:model")

    assert request_guard.enable_llm is False
    assert request_guard.llm_model is None
