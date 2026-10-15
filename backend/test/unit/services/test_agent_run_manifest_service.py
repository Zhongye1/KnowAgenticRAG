"""运行清单构建、脱敏与指纹规范化的单元测试。"""

from __future__ import annotations

import pytest

from ars.services.agent_run_manifest_service import (
    _manifest_skill_scope,
    build_manifest_payload,
    canonical_json,
    compute_config_digest,
    compute_manifest_fingerprint,
    resolve_skill_entries,
)


def _manifest(**overrides):
    payload = {
        "run_type": "chat",
        "agent_slug": "main",
        "backend_id": "chatbot",
        "model_spec": "siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5",
        "tool_approval_mode": "default",
        "normalized_context": {
            "model": "siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5",
            "tools": ["fs", "web"],
            "mcps": [],
            "skills": ["code-review"],
            "max_execution_steps": 150,
            "model_retry_times": 2,
            "system_prompt": "You are a reviewer.",
            "summary_prompt": "Summarize: {messages}",
        },
        "limits": {"max_execution_steps": 150, "model_retry_times": 2},
        "skill_entries": [{"slug": "code-review", "version": "1.2.0", "content_hash": "abc123"}],
        "code_revision": None,
    }
    payload.update(overrides)
    return build_manifest_payload(
        run_type=payload["run_type"],
        agent_slug=payload["agent_slug"],
        backend_id=payload["backend_id"],
        model_spec=payload["model_spec"],
        tool_approval_mode=payload["tool_approval_mode"],
        normalized_context=payload["normalized_context"],
        skill_entries=payload["skill_entries"],
        code_revision=payload["code_revision"],
        limits=payload["limits"],
    )


def test_same_assets_produce_same_fingerprint_regardless_of_field_order():
    first = _manifest()
    second = _manifest(
        normalized_context={
            "skills": ["code-review"],
            "mcps": [],
            "tools": ["fs", "web"],
            "summary_prompt": "Summarize: {messages}",
            "system_prompt": "You are a reviewer.",
            "model_retry_times": 2,
            "max_execution_steps": 150,
            "model": "siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5",
        }
    )

    assert compute_manifest_fingerprint(first) == compute_manifest_fingerprint(second)
    assert canonical_json({"b": 1, "a": 2}) == canonical_json({"a": 2, "b": 1})


def test_different_assets_produce_different_fingerprint():
    changed = _manifest(skill_entries=[{"slug": "code-review", "version": "1.3.0", "content_hash": "abc123"}])

    assert compute_manifest_fingerprint(_manifest()) != compute_manifest_fingerprint(changed)


def test_preload_skill_config_changes_config_digest():
    base_context = _manifest()["config_digest"]
    changed_context = {
        **{
            "model": "siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5",
            "tools": ["fs", "web"],
            "mcps": [],
            "skills": ["code-review"],
            "max_execution_steps": 150,
            "model_retry_times": 2,
            "system_prompt": "You are a reviewer.",
            "summary_prompt": "Summarize: {messages}",
        },
        "preload_skills": ["code-review"],
    }

    assert base_context != compute_config_digest(changed_context)


def test_preloaded_dependency_content_changes_manifest_fingerprint():
    normalized_context = {"skills": ["parent"], "preload_skills": ["parent"]}
    first_slugs, first_hashes, _ = _manifest_skill_scope(
        normalized_context,
        {
            "preloaded_skills": ["parent", "dependency"],
            "preloaded_skill_contents": {"parent": "first", "dependency": "dependency"},
        },
    )
    second_slugs, second_hashes, _ = _manifest_skill_scope(
        normalized_context,
        {
            "preloaded_skills": ["parent", "dependency"],
            "preloaded_skill_contents": {"parent": "changed", "dependency": "dependency"},
        },
    )

    assert first_slugs == second_slugs == ["parent", "dependency"]
    first = _manifest(
        skill_entries=[
            {"slug": slug, "version": None, "content_hash": None, "preload_content_hash": first_hashes[slug]}
            for slug in first_slugs
        ]
    )
    second = _manifest(
        skill_entries=[
            {"slug": slug, "version": None, "content_hash": None, "preload_content_hash": second_hashes[slug]}
            for slug in second_slugs
        ]
    )
    assert compute_manifest_fingerprint(first) != compute_manifest_fingerprint(second)


@pytest.mark.asyncio
async def test_personal_preloaded_skill_does_not_borrow_shadowed_database_identity():
    class FakeResult:
        def first(self):
            return type("Row", (), {"version": "shared-v1", "content_hash": "shared-hash"})()

    class FakeDB:
        async def execute(self, statement):
            del statement
            return FakeResult()

    entries = await resolve_skill_entries(
        FakeDB(),
        ["shadowed"],
        preload_content_hashes={"shadowed": "personal-root-hash"},
        personal_skill_slugs={"shadowed"},
    )

    assert entries == [
        {
            "slug": "shadowed",
            "version": None,
            "content_hash": None,
            "preload_content_hash": "personal-root-hash",
        }
    ]


def test_manifest_excludes_prompts_and_secret_shaped_values():
    context = {
        "system_prompt": "SECRET-PROMPT-BODY",
        "summary_prompt": "SECRET-SUMMARY-BODY",
        "api_key": "sk-live-abcdef",
        "token": "tok-live-abcdef",
        "tools": ["fs"],
        "mcps": [],
        "skills": [],
    }
    manifest = build_manifest_payload(
        run_type="chat",
        agent_slug="main",
        backend_id="chatbot",
        model_spec=None,
        tool_approval_mode=None,
        normalized_context=context,
        skill_entries=[],
        code_revision=None,
        limits={},
    )
    serialized = canonical_json(manifest)

    assert "SECRET-PROMPT-BODY" not in serialized
    assert "SECRET-SUMMARY-BODY" not in serialized
    assert "sk-live-abcdef" not in serialized
    assert "tok-live-abcdef" not in serialized
    # 未列入直接字段的 context 值只能以 config_digest 摘要存在。
    assert manifest["config_digest"] == compute_config_digest(context)
    assert manifest["resources"] == {"tools": ["fs"], "mcps": [], "skills": []}


def test_missing_code_revision_is_explicitly_unresolved():
    manifest = _manifest()

    assert manifest["code_revision"] == "unresolved"
    assert manifest["manifest_version"] == 1


def test_non_string_model_spec_normalizes_to_none():
    manifest = _manifest(model_spec="")

    assert manifest["model"] == {"spec": None}


@pytest.mark.parametrize(
    ("field", "expected"),
    [
        ("max_execution_steps", 150),
        ("model_retry_times", 2),
    ],
)
def test_limits_captured_from_context(field, expected):
    assert _manifest()["limits"][field] == expected


def test_effective_limits_fill_schema_defaults_for_unset_fields():
    from ars.agents.context import BaseContext
    from ars.services.agent_run_manifest_service import _effective_limits

    class FakeBackend:
        context_schema = BaseContext

    effective = _effective_limits(FakeBackend(), {"max_execution_steps": 200})

    assert effective["max_execution_steps"] == 200
    assert effective["model_retry_times"] == 2
    assert _effective_limits(None, {"max_execution_steps": 200})["model_retry_times"] is None
