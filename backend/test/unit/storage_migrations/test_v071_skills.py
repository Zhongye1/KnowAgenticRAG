from types import SimpleNamespace

import pytest

from ars.storage_migrations import v071_skills as migration


class _Db:
    @staticmethod
    def get_bind():
        return SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))

    async def commit(self):
        return None


class _EmptyRepo:
    def __init__(self, _db):
        pass

    async def list_all(self):
        return []


@pytest.mark.asyncio
async def test_v071_skill_migration_rejects_symlinked_shared_root_before_copy(tmp_path, monkeypatch):
    outside = tmp_path / "outside"
    outside.mkdir()
    legacy_root = tmp_path / "legacy"
    legacy_root.mkdir()
    (legacy_root / "skills").symlink_to(outside, target_is_directory=True)
    monkeypatch.setattr(migration, "get_legacy_storage_dir", lambda: legacy_root)

    with pytest.raises(ValueError, match="共享 Skill 历史根目录非法"):
        await migration.migrate_shared_skills(_Db())

    assert outside.is_dir()


@pytest.mark.asyncio
async def test_unregistered_v071_skill_is_preserved_as_non_executable_orphan(tmp_path, monkeypatch):
    legacy_root = tmp_path / "legacy"
    orphan = legacy_root / "skills" / "forgotten"
    orphan.mkdir(parents=True)
    (orphan / "notes.txt").write_text("preserved", encoding="utf-8")
    skill_data = tmp_path / "skill-data"
    monkeypatch.setattr(migration, "get_legacy_storage_dir", lambda: legacy_root)
    monkeypatch.setattr(migration, "get_skill_data_dir", lambda: skill_data)
    monkeypatch.setattr(migration, "SkillRepository", _EmptyRepo)

    await migration.migrate_shared_skills(_Db())

    assert not orphan.exists()
    assert (skill_data / "legacy-orphans/shared/forgotten/notes.txt").read_text(encoding="utf-8") == "preserved"


@pytest.mark.asyncio
async def test_v071_skill_migration_leaves_personal_workspace_skills_untouched(tmp_path, monkeypatch):
    legacy_root = tmp_path / "user-data/shared/removed-user/workspace/agents/skills"
    personal_skill = legacy_root / "private-notes"
    personal_skill.mkdir(parents=True)
    (personal_skill / "notes.txt").write_text("preserved", encoding="utf-8")
    monkeypatch.setattr(migration, "get_legacy_storage_dir", lambda: tmp_path / "legacy")
    monkeypatch.setattr(migration, "SkillRepository", _EmptyRepo)

    await migration.migrate_shared_skills(_Db())

    assert (personal_skill / "notes.txt").read_text(encoding="utf-8") == "preserved"


def test_v071_skill_migration_marker_is_persistent_and_atomic(tmp_path, monkeypatch):
    monkeypatch.setattr(migration, "get_skill_data_dir", lambda: tmp_path)

    assert migration.migration_completed() is False
    migration.mark_migrated()
    assert migration.migration_completed() is True
    assert not list(tmp_path.glob(".*.tmp"))
