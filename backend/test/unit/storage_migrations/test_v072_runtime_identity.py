from __future__ import annotations

from pathlib import Path

import pytest

from ars.storage_migrations import v072_runtime_identity as migration


def _configure_roots(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path, Path]:
    roots = (tmp_path / "user-data", tmp_path / "skill-sources", tmp_path / "skill-projections")
    monkeypatch.setattr(migration, "get_user_data_dir", lambda: roots[0])
    monkeypatch.setattr(migration, "get_skill_data_dir", lambda: roots[1])
    monkeypatch.setattr(migration, "get_skill_projection_dir", lambda: roots[2])
    monkeypatch.delenv("NLTK_DATA", raising=False)
    monkeypatch.setattr(migration.os, "geteuid", lambda: 0)
    return roots


def test_runtime_identity_migration_normalizes_real_entries_and_publishes_marker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    roots = _configure_roots(tmp_path, monkeypatch)
    executable = roots[0] / "shared/user-1/workspace/projects/run.sh"
    executable.parent.mkdir(parents=True)
    executable.write_text("#!/bin/sh\n", encoding="utf-8")
    executable.chmod(0o755)
    document = roots[1] / "shared/doc/SKILL.md"
    document.parent.mkdir(parents=True)
    document.write_text("skill", encoding="utf-8")
    ownership_updates: list[tuple[int, int]] = []
    monkeypatch.setattr(
        migration.os,
        "fchown",
        lambda _fd, uid, gid: ownership_updates.append((uid, gid)),
    )

    migration.migrate_runtime_storage_identity()

    assert executable.stat().st_mode & 0o777 == 0o700
    assert document.stat().st_mode & 0o777 == 0o600
    assert executable.parent.stat().st_mode & 0o777 == 0o700
    assert (roots[0] / ".v072-runtime-identity").read_text(encoding="ascii") == "1000:1000\n"
    assert ownership_updates
    assert set(ownership_updates) == {(1000, 1000)}


def test_runtime_identity_migration_preserves_symlink_without_following_target(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    roots = _configure_roots(tmp_path, monkeypatch)
    workspace = roots[0] / "shared/user-1/workspace"
    workspace.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    (workspace / "linked").symlink_to(outside, target_is_directory=True)
    ownership_updates: list[tuple[str, bool]] = []
    monkeypatch.setattr(migration.os, "fchown", lambda *_args: None)
    monkeypatch.setattr(
        migration.os,
        "chown",
        lambda name, _uid, _gid, *, dir_fd, follow_symlinks: ownership_updates.append((name, follow_symlinks)),
    )

    migration.migrate_runtime_storage_identity()

    assert (workspace / "linked").is_symlink()
    assert outside.stat().st_mode & 0o777 == 0o755
    assert ("linked", False) in ownership_updates
    assert (roots[0] / ".v072-runtime-identity").exists()


def test_runtime_identity_marker_makes_migration_idempotent(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    roots = _configure_roots(tmp_path, monkeypatch)
    for root in roots:
        root.mkdir()
    marker = roots[0] / ".v072-runtime-identity"
    marker.write_text("1000:1000\n", encoding="ascii")
    monkeypatch.setattr(migration.os, "geteuid", lambda: 1000)
    monkeypatch.setattr(migration.os, "fchown", lambda *_args: pytest.fail("completed migration must not rerun"))

    migration.migrate_runtime_storage_identity()

    assert marker.read_text(encoding="ascii") == "1000:1000\n"


def test_existing_runtime_storage_requires_quiescence_until_marker_is_published(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    roots = _configure_roots(tmp_path, monkeypatch)
    for root in roots:
        root.mkdir()

    assert migration.runtime_storage_requires_quiescence() is False

    (roots[1] / "existing.txt").write_text("data", encoding="utf-8")
    assert migration.runtime_storage_requires_quiescence() is True

    (roots[0] / ".v072-runtime-identity").write_text("1000:1000\n", encoding="ascii")
    assert migration.runtime_storage_requires_quiescence() is False
