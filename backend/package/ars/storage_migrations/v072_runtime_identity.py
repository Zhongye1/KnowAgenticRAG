"""把持久文件一次性收敛到固定的非 root 运行身份。"""

from __future__ import annotations

import os
import stat
import uuid
from pathlib import Path

from ars.config import get_skill_data_dir, get_skill_projection_dir, get_user_data_dir

RUNTIME_UID = 1000
RUNTIME_GID = 1000
_MIGRATION_MARKER = ".v072-runtime-identity"
_MARKER_CONTENT = "1000:1000\n"
_DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def runtime_identity_migration_completed() -> bool:
    """返回统一运行身份迁移是否已经完整发布。"""
    return _marker_completed(get_user_data_dir() / _MIGRATION_MARKER)


def runtime_storage_requires_quiescence() -> bool:
    """已有持久字节首次变更身份前必须停止所有文件 consumer。"""
    if runtime_identity_migration_completed():
        return False
    return any(root.exists() and any(root.iterdir()) for root in _runtime_storage_roots())


def migrate_runtime_storage_identity() -> None:
    """迁移持久目录所有权，并在全部成功后发布完成标记。"""
    roots = _runtime_storage_roots()
    for root in roots:
        root.mkdir(parents=True, exist_ok=True)

    user_data_root = roots[0]
    marker = user_data_root / _MIGRATION_MARKER
    if _marker_completed(marker):
        return
    if os.geteuid() != 0:
        raise PermissionError("runtime identity migration must run as root")

    for root in roots:
        root_fd = os.open(root, _DIRECTORY_FLAGS)
        try:
            _normalize_directory(root_fd)
        finally:
            os.close(root_fd)
    _write_marker(user_data_root, marker.name)


def _runtime_storage_roots() -> list[Path]:
    roots = [get_user_data_dir(), get_skill_data_dir(), get_skill_projection_dir()]
    if nltk_data := os.getenv("NLTK_DATA"):
        roots.append(Path(nltk_data))
    return roots


def _marker_completed(marker: Path) -> bool:
    """只接受未经过 symlink 的普通完成标记。"""
    try:
        marker_fd = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return False
    try:
        if not stat.S_ISREG(os.fstat(marker_fd).st_mode):
            raise RuntimeError("runtime identity migration marker is not a regular file")
        content = os.read(marker_fd, len(_MARKER_CONTENT) + 1).decode("ascii")
    finally:
        os.close(marker_fd)
    if content != _MARKER_CONTENT:
        raise RuntimeError("runtime identity migration marker is invalid")
    return True


def _normalize_directory(directory_fd: int) -> None:
    """递归收紧真实条目，不跟随用户 symlink。"""
    os.fchown(directory_fd, RUNTIME_UID, RUNTIME_GID)
    os.fchmod(directory_fd, 0o700)
    for name in os.listdir(directory_fd):
        item_stat = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if stat.S_ISLNK(item_stat.st_mode):
            os.chown(
                name,
                RUNTIME_UID,
                RUNTIME_GID,
                dir_fd=directory_fd,
                follow_symlinks=False,
            )
            continue
        if stat.S_ISDIR(item_stat.st_mode):
            child_fd = os.open(name, _DIRECTORY_FLAGS, dir_fd=directory_fd)
            try:
                _normalize_directory(child_fd)
            finally:
                os.close(child_fd)
            continue
        owner_mode = 0o700 if item_stat.st_mode & 0o111 else 0o600
        if stat.S_ISREG(item_stat.st_mode):
            file_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
            try:
                os.fchown(file_fd, RUNTIME_UID, RUNTIME_GID)
                os.fchmod(file_fd, owner_mode)
            finally:
                os.close(file_fd)
            continue
        os.chown(
            name,
            RUNTIME_UID,
            RUNTIME_GID,
            dir_fd=directory_fd,
            follow_symlinks=False,
        )
        os.chmod(
            name,
            owner_mode,
            dir_fd=directory_fd,
            follow_symlinks=False,
        )


def _write_marker(root: Path, marker_name: str) -> None:
    """在已迁移根中原子发布完成标记。"""
    root_fd = os.open(root, _DIRECTORY_FLAGS)
    temp_name = f".{marker_name}-{uuid.uuid4().hex}"
    try:
        marker_fd = os.open(
            temp_name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=root_fd,
        )
        content = _MARKER_CONTENT.encode("ascii")
        offset = 0
        try:
            while offset < len(content):
                offset += os.write(marker_fd, content[offset:])
            os.fchown(marker_fd, RUNTIME_UID, RUNTIME_GID)
            os.fchmod(marker_fd, 0o600)
        finally:
            os.close(marker_fd)
        os.rename(temp_name, marker_name, src_dir_fd=root_fd, dst_dir_fd=root_fd)
    finally:
        try:
            os.unlink(temp_name, dir_fd=root_fd)
        except FileNotFoundError:
            pass
        os.close(root_fd)
