from __future__ import annotations

import os
from pathlib import Path

import pytest

from ars.workspace import filesystem as workspace_filesystem_module
from ars.workspace.filesystem import Workspace


def test_upload_authorized_file_uses_owner_only_mode(
    tmp_path: Path,
    monkeypatch,
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    source = tmp_path / "source.txt"
    source.write_text("content", encoding="utf-8")
    monkeypatch.setattr(workspace_filesystem_module, "user_workspace_dir", lambda _uid: workspace_root)

    previous_umask = os.umask(0o077)
    try:
        Workspace("user-1").upload_authorized_file_from_path(
            "/projects/11111111-1111-4111-8111-111111111111/file.txt",
            str(source),
        )
    finally:
        os.umask(previous_umask)

    target = workspace_root / "projects" / "11111111-1111-4111-8111-111111111111" / "file.txt"
    assert target.read_text(encoding="utf-8") == "content"
    assert target.stat().st_mode & 0o777 == 0o600
    assert target.parent.stat().st_mode & 0o777 == 0o700


@pytest.mark.parametrize("existing_kind", ["file", "symlink"])
def test_upload_without_overwrite_atomically_preserves_existing_entry(
    tmp_path: Path,
    monkeypatch,
    existing_kind: str,
) -> None:
    workspace_root = tmp_path / "workspace"
    project_root = workspace_root / "projects" / "11111111-1111-4111-8111-111111111111"
    project_root.mkdir(parents=True)
    outside = tmp_path / "outside.txt"
    outside.write_text("outside", encoding="utf-8")
    target = project_root / "occupied.txt"
    if existing_kind == "file":
        target.write_text("original", encoding="utf-8")
    else:
        target.symlink_to(outside)
    source = tmp_path / "source.txt"
    source.write_text("replacement", encoding="utf-8")
    monkeypatch.setattr(workspace_filesystem_module, "user_workspace_dir", lambda _uid: workspace_root)

    with pytest.raises(FileExistsError):
        Workspace("user-1").upload_authorized_file_from_path(
            "/projects/11111111-1111-4111-8111-111111111111/occupied.txt",
            str(source),
            overwrite=False,
        )

    if existing_kind == "file":
        assert target.read_text(encoding="utf-8") == "original"
    else:
        assert target.is_symlink()
    assert outside.read_text(encoding="utf-8") == "outside"


def test_upload_without_parent_creation_rejects_missing_directory(
    tmp_path: Path,
    monkeypatch,
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    source = tmp_path / "source.txt"
    source.write_text("content", encoding="utf-8")
    monkeypatch.setattr(workspace_filesystem_module, "user_workspace_dir", lambda _uid: workspace_root)

    with pytest.raises(FileNotFoundError):
        Workspace("user-1").upload_authorized_file_from_path(
            "/missing/file.txt",
            str(source),
            create_parents=False,
        )

    assert not (workspace_root / "missing").exists()


def test_create_authorized_directory_uses_owner_only_mode(
    tmp_path: Path,
    monkeypatch,
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    monkeypatch.setattr(workspace_filesystem_module, "user_workspace_dir", lambda _uid: workspace_root)

    previous_umask = os.umask(0o077)
    try:
        metadata = Workspace("user-1").create_authorized_directory(
            "/",
            "project",
            root="/",
        )
    finally:
        os.umask(previous_umask)

    assert metadata["is_dir"] is True
    assert metadata["size"] == 0
    assert (workspace_root / "project").stat().st_mode & 0o777 == 0o700


def test_write_rejects_final_symlink_without_touching_target(
    tmp_path: Path,
    monkeypatch,
) -> None:
    workspace_root = tmp_path / "workspace"
    workdir = workspace_root / "projects" / "11111111-1111-4111-8111-111111111111"
    workdir.mkdir(parents=True)
    outside = tmp_path / "outside.txt"
    outside.write_text("outside", encoding="utf-8")
    (workdir / "note.txt").symlink_to(outside)
    monkeypatch.setattr(workspace_filesystem_module, "user_workspace_dir", lambda _uid: workspace_root)

    with pytest.raises(PermissionError, match="symlink"):
        Workspace("user-1").write_authorized_file(
            "/projects/11111111-1111-4111-8111-111111111111/note.txt",
            b"replacement",
        )

    assert outside.read_text(encoding="utf-8") == "outside"


def test_read_authorized_file_prefix_reports_truncation(tmp_path: Path, monkeypatch) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / "AGENTS.md").write_bytes(b"abcdef")
    monkeypatch.setattr(workspace_filesystem_module, "user_workspace_dir", lambda _uid: workspace_root)

    content, truncated = Workspace("user-1").read_authorized_file_prefix(
        "/AGENTS.md",
        4,
    )

    assert content == b"abcd"
    assert truncated is True


def test_workspace_boundary_rejects_deleting_its_root(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(workspace_filesystem_module, "user_workspace_dir", lambda _uid: tmp_path)

    with pytest.raises(ValueError, match="cannot target"):
        Workspace("user-1").delete_authorized_path("/", root="/")


def test_search_tree_prunes_hidden_excluded_and_overdeep_directories(tmp_path: Path, monkeypatch) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    (workspace_root / "main.py").write_text("main", encoding="utf-8")
    hidden = workspace_root / ".git"
    hidden.mkdir()
    (hidden / "secret.py").write_text("secret", encoding="utf-8")
    deep = workspace_root
    for index in range(4):
        deep = deep / f"dir-{index}"
        deep.mkdir()
    (deep / "too-deep.py").write_text("deep", encoding="utf-8")
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "escaped.py").write_text("escaped", encoding="utf-8")
    (workspace_root / "linked").symlink_to(outside, target_is_directory=True)
    monkeypatch.setattr(workspace_filesystem_module, "user_workspace_dir", lambda _uid: workspace_root)

    results = Workspace("user-1").search_authorized_tree(
        "/",
        ".py",
        exclude_directories=frozenset({".git"}),
        exclude_hidden=True,
        max_depth=2,
    )

    assert [item["name"] for item in results] == ["main.py"]


def test_search_tree_limits_flat_directory_width_and_total_scan(tmp_path: Path, monkeypatch) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    for index in range(30):
        (workspace_root / f"file-{index:02}.txt").write_text(str(index), encoding="utf-8")
    monkeypatch.setattr(workspace_filesystem_module, "user_workspace_dir", lambda _uid: workspace_root)

    results = Workspace("user-1").search_authorized_tree(
        "/",
        "file",
        max_results=100,
        max_entries_per_directory=12,
        max_scanned_entries=7,
    )

    assert len(results) == 7
    assert all(item["name"].startswith("file-") for item in results)


def test_search_tree_entry_budget_limits_actual_directory_iteration(tmp_path: Path, monkeypatch) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    for index in range(30):
        (workspace_root / f"file-{index:02}.txt").write_text(str(index), encoding="utf-8")
    monkeypatch.setattr(workspace_filesystem_module, "user_workspace_dir", lambda _uid: workspace_root)
    real_scandir = os.scandir
    examined = 0

    class CountingScandir:
        def __init__(self, path):
            self._iterator = real_scandir(path)

        def __enter__(self):
            self._iterator.__enter__()
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return self._iterator.__exit__(exc_type, exc_value, traceback)

        def __iter__(self):
            return self

        def __next__(self):
            nonlocal examined
            entry = next(self._iterator)
            examined += 1
            return entry

    monkeypatch.setattr(workspace_filesystem_module.os, "scandir", CountingScandir)

    Workspace("user-1").search_authorized_tree(
        "/",
        "file",
        max_results=100,
        max_entries_per_directory=12,
        max_scanned_entries=7,
    )

    assert examined == 7
