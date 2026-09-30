"""以一个持久化 Project Workdir 为根的文件视图。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath

from .filesystem import Workspace
from .paths import normalize_workdir_path


@dataclass(frozen=True, slots=True)
class Workdir:
    """把浏览 scope `/...` 固定到一个持久化 Workspace 目录。"""

    relative_path: str
    workspace: Workspace

    def __post_init__(self) -> None:
        object.__setattr__(self, "relative_path", normalize_workdir_path(self.relative_path))

    @classmethod
    def open_existing(cls, uid: str, workdir_path: str) -> Workdir:
        """打开已存在的持久化 Workdir，并返回受限文件 capability。"""
        workdir = cls(workdir_path, Workspace(str(uid)))
        if not workdir.stat("/")["is_dir"]:
            raise ValueError("workdir_path does not reference an existing directory")
        return workdir

    @property
    def root_path(self) -> str:
        return f"/{self.relative_path}"

    def resolve_path(self, path: str | None) -> str:
        """把 Workdir scope 路径解析为 UserWorkspace scope 路径。"""
        raw = str(path or "/").strip() or "/"
        pure = PurePosixPath(raw)
        if not pure.is_absolute() or ".." in pure.parts or "\\" in raw or "://" in raw:
            raise ValueError("invalid Workdir scope path")
        normalized = pure.as_posix()
        if normalized == "/":
            return self.root_path
        return f"{self.root_path}{normalized}"

    def scope_path(self, workspace_path: str) -> str:
        """把当前 Workdir 内的 UserWorkspace 路径转换为浏览 scope。"""
        normalized = PurePosixPath(str(workspace_path)).as_posix()
        root = self.root_path.rstrip("/")
        if normalized == root:
            return "/"
        if not normalized.startswith(f"{root}/"):
            raise ValueError("path is outside the Workdir")
        return f"/{normalized[len(root) + 1 :]}"

    def list_directory(self, path: str = "/") -> list[dict]:
        return self.workspace.list_authorized_directory(self.resolve_path(path), root=self.root_path)

    def search(self, query: str, **limits) -> list[dict]:
        matches = self.workspace.search_authorized_tree(self.root_path, query, **limits)
        return [{**item, "path": self.scope_path(str(item["path"]))} for item in matches]

    def read_file(self, path: str, max_bytes: int) -> bytes:
        return self.workspace.read_authorized_file(self.resolve_path(path), max_bytes)

    def read_file_prefix(self, path: str, max_bytes: int) -> tuple[bytes, bool]:
        return self.workspace.read_authorized_file_prefix(self.resolve_path(path), max_bytes)

    def write_file(self, path: str, content: bytes) -> dict:
        return self.workspace.write_authorized_file(self.resolve_path(path), content)

    def stat(self, path: str) -> dict:
        return self.workspace.stat_authorized_path(self.resolve_path(path), root=self.root_path)

    def copy_file_to_path(self, path: str, target_path: str, max_bytes: int) -> int:
        return self.workspace.download_authorized_file_to_path(self.resolve_path(path), target_path, max_bytes)

    def copy_file_from_path(self, path: str, source_path: str, *, overwrite: bool = True) -> dict:
        return self.workspace.upload_authorized_file_from_path(
            self.resolve_path(path),
            source_path,
            overwrite=overwrite,
        )

    def create_directory(self, parent_path: str, name: str) -> dict:
        return self.workspace.create_authorized_directory(
            self.resolve_path(parent_path),
            name,
            root=self.root_path,
        )

    def delete(self, path: str) -> None:
        self.workspace.delete_authorized_path(self.resolve_path(path), root=self.root_path)
