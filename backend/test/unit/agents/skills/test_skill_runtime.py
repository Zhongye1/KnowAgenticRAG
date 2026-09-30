from types import SimpleNamespace

import pytest

import ars.agents.skills.runtime as skill_runtime
from ars.agents.skills.runtime import build_dependency_bundle, expand_skill_closure, resolve_runtime_skills_for_context


def _skill(tmp_path, slug: str, *, dependencies: list[str] | None = None, content: str | None = None):
    source_dir = tmp_path / slug
    source_dir.mkdir()
    (source_dir / "SKILL.md").write_text(content or f"# {slug}", encoding="utf-8")
    return SimpleNamespace(
        slug=slug,
        name=slug.title(),
        description=f"{slug} desc",
        source_scope="shared",
        source_dir=source_dir,
        tool_dependencies=[],
        mcp_dependencies=[],
        skill_dependencies=dependencies or [],
    )


@pytest.mark.asyncio
async def test_resolve_runtime_skills_derives_authorized_scope(monkeypatch):
    """运行时 scope 只保留授权选择，并按依赖闭包区分共享与个人来源。"""

    async def fake_list_accessible_skills(db, user):
        assert db is not None
        assert user is not None
        return [
            SimpleNamespace(
                slug="alpha",
                name="Alpha",
                description="alpha desc",
                source_scope="shared",
                source_dir="/tmp/shared/alpha",
                tool_dependencies=[],
                mcp_dependencies=[],
                skill_dependencies=["beta"],
            ),
            SimpleNamespace(
                slug="beta",
                name="Beta",
                description="beta desc",
                source_scope="personal",
                source_dir="/tmp/personal/beta",
                tool_dependencies=[],
                mcp_dependencies=[],
                skill_dependencies=[],
            ),
        ]

    monkeypatch.setattr(skill_runtime, "list_accessible_skills", fake_list_accessible_skills)

    scope = await resolve_runtime_skills_for_context(
        SimpleNamespace(skills=["alpha", "missing"]),
        db=object(),
        user=object(),
    )

    assert scope["context_skills"] == ["alpha"]
    assert scope["effective_skills"] == ["alpha", "beta"]
    assert set(scope["runtime_skills"]) == {"alpha", "beta"}
    assert scope["runtime_skills"]["alpha"]["path"] == "/home/gem/skills/alpha/SKILL.md"
    assert scope["runtime_skills"]["beta"]["path"] == "/home/gem/user-data/agents/skills/beta/SKILL.md"
    assert scope["runtime_skills"]["alpha"]["skills"] == ["beta"]


def test_expand_skill_closure_handles_cycles_missing_and_duplicates():
    """循环、缺失目标和重复依赖保持 fail-safe 且稳定去重。"""
    runtime_skills = {
        "alpha": {"tools": [], "mcps": [], "skills": ["beta", "missing", "beta"]},
        "beta": {"tools": [], "mcps": [], "skills": ["alpha"]},
    }

    assert expand_skill_closure(["alpha", "alpha"], runtime_skills) == ["alpha", "beta"]


def test_dependency_bundle_returns_only_consumed_dependencies():
    """依赖包只暴露 Middleware 消费的工具和 MCP 字段。"""
    runtime_skills = {
        "alpha": {"tools": ["tool-a", "tool-a"], "mcps": ["mcp-a"], "skills": ["beta"]},
        "beta": {"tools": ["tool-b"], "mcps": ["mcp-a", "mcp-b"], "skills": []},
    }

    bundle = build_dependency_bundle(["alpha", "beta"], runtime_skills)

    assert bundle == {"tools": ["tool-a", "tool-b"], "mcps": ["mcp-a", "mcp-b"]}
    assert "skills" not in bundle


@pytest.mark.asyncio
async def test_preload_reads_authorized_dependency_closure(tmp_path, monkeypatch):
    skills = [
        _skill(tmp_path, "alpha", dependencies=["beta"], content="# Alpha\nUSE_ALPHA"),
        _skill(tmp_path, "beta", content="# Beta\nUSE_BETA"),
    ]

    async def fake_list_accessible_skills(_db, _user):
        return skills

    monkeypatch.setattr(skill_runtime, "list_accessible_skills", fake_list_accessible_skills)
    scope = await resolve_runtime_skills_for_context(
        SimpleNamespace(skills=["alpha"], preload_skills=["alpha", "beta", "missing"]),
        db=object(),
        user=object(),
    )

    assert scope["context_preload_skills"] == ["alpha"]
    assert scope["preloaded_skills"] == ["alpha", "beta"]
    assert scope["preloaded_skill_contents"] == {
        "alpha": "# Alpha\nUSE_ALPHA",
        "beta": "# Beta\nUSE_BETA",
    }


@pytest.mark.asyncio
async def test_preload_rejects_symlinked_source_ancestor(tmp_path, monkeypatch):
    real_parent = tmp_path / "real"
    real_parent.mkdir()
    item = _skill(real_parent, "alpha")
    linked_parent = tmp_path / "linked"
    linked_parent.symlink_to(real_parent, target_is_directory=True)
    item.source_dir = linked_parent / "alpha"

    async def fake_list_accessible_skills(_db, _user):
        return [item]

    monkeypatch.setattr(skill_runtime, "list_accessible_skills", fake_list_accessible_skills)

    with pytest.raises(RuntimeError, match="根级 SKILL.md 不可读"):
        await resolve_runtime_skills_for_context(
            SimpleNamespace(skills=["alpha"], preload_skills=["alpha"]),
            db=object(),
            user=object(),
        )


@pytest.mark.asyncio
async def test_lite_mode_excludes_knowledge_base_from_preload(tmp_path, monkeypatch):
    item = _skill(tmp_path, "knowledge-base")

    async def fake_list_accessible_skills(_db, _user):
        return [item]

    monkeypatch.setattr(skill_runtime, "list_accessible_skills", fake_list_accessible_skills)
    monkeypatch.setattr(skill_runtime, "lite_mode_enabled", lambda: True)
    scope = await resolve_runtime_skills_for_context(
        SimpleNamespace(skills=["knowledge-base"], preload_skills=["knowledge-base"]),
        db=object(),
        user=object(),
    )

    assert scope["context_skills"] == []
    assert scope["preloaded_skills"] == []
    assert scope["preloaded_skill_contents"] == {}
