from __future__ import annotations

import contextlib
import errno
import hashlib
import os
import re
import uuid
from pathlib import Path, PurePosixPath

from ars.config import get_user_data_dir
from ars.utils.logging_config import logger
from ars.utils.paths import open_directory_fd

WORKSPACE_DIR_NAME = "workspace"
WORKSPACE_AGENTS_DIR_NAME = "agents"
WORKSPACE_AGENT_CONTEXT_FILES = {
    "AGENTS.md": "# AGENTS\n\n以下是约束 Agent 行为的一些要求\n",
    "USER.md": "# USER\n\n以下是有关用户的一些信息\n",
    "MEMORY.md": "# MEMORY\n\n以下是 Agent 需要记住的一些信息\n",
}

_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
WORKDIR_PROJECTS_DIR_NAME = "projects"

_raw_virtual_prefix = os.getenv("SANDBOX_VIRTUAL_PATH_PREFIX")
VIRTUAL_PATH_PREFIX = (
    _raw_virtual_prefix.strip() if _raw_virtual_prefix else "/home/gem/user-data"
) or "/home/gem/user-data"
if not VIRTUAL_PATH_PREFIX.startswith("/"):
    VIRTUAL_PATH_PREFIX = f"/{VIRTUAL_PATH_PREFIX}"


def runtime_workdir_path(workdir_path: str) -> str:
    """把持久化 Workdir 标识映射到 Sandbox runtime。"""
    return f"{VIRTUAL_PATH_PREFIX.rstrip('/')}/{normalize_workdir_path(workdir_path)}"


def validate_thread_id(thread_id: str) -> str:
    value = str(thread_id or "").strip()
    if not value:
        raise ValueError("thread_id is required")
    if not _SAFE_ID_RE.match(value):
        raise ValueError("thread_id contains invalid characters")
    return value


def normalize_workdir_path(workdir_path: str) -> str:
    """规范化数据库中的 UserWorkspace 相对 Workdir 路径。"""
    raw = str(workdir_path or "").strip()
    pure = PurePosixPath(raw)
    if not raw or pure.is_absolute() or "\\" in raw or "://" in raw:
        raise ValueError("workdir_path must be a relative POSIX path")
    if any(part in {"", ".", ".."} for part in raw.split("/")):
        raise ValueError("workdir_path contains invalid path components")
    return pure.as_posix()


def normalize_linked_workdir_path(workdir_path: str) -> str:
    """规范化用户选择的 linked Workdir；Workspace 根由相对路径约束拒绝。"""
    return normalize_workdir_path(workdir_path)


def normalize_managed_workdir_path(workdir_path: str) -> str:
    """规范化服务端管理的 ``projects/<uuid>`` Workdir 路径。"""
    raw = str(workdir_path or "").strip()
    pure = PurePosixPath(raw)
    if not raw or pure.is_absolute() or "\\" in raw or "://" in raw:
        raise ValueError("managed workdir_path must use projects/<uuid>")
    if any(part in {"", ".", ".."} for part in raw.split("/")):
        raise ValueError("managed workdir_path must use projects/<uuid>")
    if len(pure.parts) != 2 or pure.parts[0] != WORKDIR_PROJECTS_DIR_NAME:
        raise ValueError("managed workdir_path must use projects/<uuid>")
    try:
        workdir_id = uuid.UUID(pure.parts[1])
    except ValueError as exc:
        raise ValueError("managed workdir_path must use projects/<uuid>") from exc
    return f"{WORKDIR_PROJECTS_DIR_NAME}/{workdir_id}"


def workspace_uid_dirname(uid: str) -> str:
    """Return a path-safe, stable workspace directory name for a logical UID.

    Database and OIDC subject identifiers may contain characters such as ``:``
    that are valid identity data but unsafe in filesystem path components.
    Legacy simple UIDs retain their directory name; all other values use a
    namespaced SHA-256 digest at the filesystem boundary only.
    """
    value = str(uid or "").strip()
    if not value:
        raise ValueError("uid is required")
    if _SAFE_ID_RE.fullmatch(value):
        return value
    return f"uid-{hashlib.sha256(value.encode('utf-8')).hexdigest()}"


def global_user_data_dir(uid: str) -> Path:
    """Return the shared host-side directory used for one user's workspace files."""
    safe_uid = workspace_uid_dirname(uid)
    return get_user_data_dir() / "shared" / safe_uid


def user_workspace_dir(uid: str) -> Path:
    """返回用户级实时 Workspace 根。"""
    return global_user_data_dir(uid) / WORKSPACE_DIR_NAME


def user_workdir_host_dir(uid: str, workdir_path: str) -> Path:
    """解析当前用户 Workdir，拒绝任意 symlink 路径组件。"""
    normalized = normalize_workdir_path(workdir_path)
    workspace = user_workspace_dir(uid)
    target = workspace.joinpath(*PurePosixPath(normalized).parts)
    _open_workspace_directory(uid, PurePosixPath(normalized).parts)
    if not target.is_dir():
        raise ValueError("workdir_path does not reference an existing directory")
    return target


def allocate_default_user_workdir_path() -> str:
    """分配默认 Workdir 相对路径，不在数据库事务提交前创建目录。"""
    return f"{WORKDIR_PROJECTS_DIR_NAME}/{uuid.uuid4()}"


def ensure_bound_user_workdir(uid: str, workdir_path: str) -> None:
    """物化已提交数据库绑定的 canonical Workdir。"""
    normalized = normalize_managed_workdir_path(workdir_path)
    parts = PurePosixPath(normalized).parts
    try:
        _open_workspace_directory(uid, parts)
        return
    except FileNotFoundError:
        pass
    ensure_user_workspace(uid)
    workspace_fd = _open_user_workspace_fd(uid)
    try:
        directory_fd = _open_workspace_child_fd(workspace_fd, parts, create=True)
        os.close(directory_fd)
    finally:
        os.close(workspace_fd)


def _open_workspace_directory(uid: str, parts: tuple[str, ...]) -> None:
    """逐层以 O_NOFOLLOW 打开 UserWorkspace 目录。"""
    directory_fd = _open_user_workspace_fd(uid)
    try:
        child_fd = _open_workspace_child_fd(directory_fd, parts)
        os.close(child_fd)
    finally:
        os.close(directory_fd)


def _open_user_workspace_fd(uid: str, *, create: bool = False) -> int:
    """从配置根逐层打开 uid 的 Workspace，拒绝中间 symlink。"""
    root = get_user_data_dir()
    if create:
        root.mkdir(parents=True, exist_ok=True)
    try:
        return open_directory_fd(
            root,
            ("shared", workspace_uid_dirname(uid), WORKSPACE_DIR_NAME),
            create=create,
        )
    except OSError as exc:
        if exc.errno in {errno.ELOOP, errno.ENOTDIR}:
            raise ValueError("UserWorkspace 路径包含符号链接或非目录组件") from exc
        raise


def _open_workspace_child_fd(directory_fd: int, parts: tuple[str, ...], *, create: bool = False) -> int:
    """从已固定的 UserWorkspace fd 打开子目录并翻译边界错误。"""
    try:
        return open_directory_fd(directory_fd, parts, create=create)
    except OSError as exc:
        if exc.errno in {errno.ELOOP, errno.ENOTDIR}:
            raise ValueError("UserWorkspace 路径包含符号链接或非目录组件") from exc
        raise


def _ensure_workspace_default_files_fd(workspace_fd: int) -> None:
    """通过已校验的 Workspace fd 初始化 Agent 上下文文件。"""
    try:
        agents_fd = open_directory_fd(workspace_fd, (WORKSPACE_AGENTS_DIR_NAME,), create=True)
    except OSError as exc:
        logger.warning(f"工作区默认 Agents 目录初始化失败: {exc}")
        return
    try:
        for filename, default_content in WORKSPACE_AGENT_CONTEXT_FILES.items():
            try:
                file_fd = os.open(
                    filename,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                    0o600,
                    dir_fd=agents_fd,
                )
            except FileExistsError:
                continue
            except OSError as exc:
                logger.warning(f"工作区默认 {filename} 初始化失败: {exc}")
                continue
            try:
                content = default_content.encode("utf-8")
                offset = 0
                while offset < len(content):
                    offset += os.write(file_fd, content[offset:])
            except BaseException:
                os.close(file_fd)
                file_fd = None
                with contextlib.suppress(FileNotFoundError):
                    os.unlink(filename, dir_fd=agents_fd)
                raise
            finally:
                if file_fd is not None:
                    os.close(file_fd)
    finally:
        os.close(agents_fd)


def ensure_user_workspace(uid: str) -> None:
    """创建用户级 Workspace 与默认 Agent 上下文文件。"""
    workspace_fd = _open_user_workspace_fd(uid, create=True)
    try:
        _ensure_workspace_default_files_fd(workspace_fd)
    finally:
        os.close(workspace_fd)
