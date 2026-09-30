from __future__ import annotations

from ars.services import chat_service as svc


def test_apply_model_override_sets_model_from_meta():
    input_context = {"model": "agent-default"}
    svc._apply_model_override(input_context, {"model_spec": "user-pick"})
    assert input_context["model"] == "user-pick"


def test_apply_model_override_noop_without_model_spec():
    input_context = {"model": "agent-default"}
    svc._apply_model_override(input_context, {"request_id": "r1"})
    svc._apply_model_override(input_context, None)
    assert input_context["model"] == "agent-default"
