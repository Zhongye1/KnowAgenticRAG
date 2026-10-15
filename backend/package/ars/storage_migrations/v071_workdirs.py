"""把 v0.7.1 Thread 文件一次性导入 UserWorkspace。"""

from __future__ import annotations

import errno
import hashlib
import os
import re
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from sqlalchemy import select, text
from sqlalchemy.orm.attributes import flag_modified

from ars.config import get_legacy_storage_dir
from ars.storage.postgres.models_business import Conversation, Message, Project, ToolCall
from ars.utils.paths import open_directory_fd
from ars.workspace.filesystem import Workspace
from ars.workspace.paths import (
    ensure_user_workspace,
    normalize_managed_workdir_path,
    runtime_workdir_path,
    user_workdir_host_dir,
    user_workspace_dir,
)

_SAFE_LEGACY_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_CURRENT_ATTACHMENT_FIELDS = {
    "file_id",
    "file_name",
    "file_type",
    "file_size",
    "status",
    "uploaded_at",
    "path",
    "original_path",
    "request_id",
}


@dataclass(frozen=True, slots=True)
class V071WorkdirBinding:
    """v0.7.1 Conversation 的目标 Workdir 与所属用户。"""

    workdir_id: str
    uid: str


@dataclass(frozen=True, slots=True)
class V071ConversationBinding:
    """v0.7.1 Conversation 到目标 Workdir 的映射。"""

    thread_id: str
    uid: str
    workdir_id: str


@dataclass(frozen=True, slots=True)
class V071WorkdirMigrationPlan:
    """v0.7.1 Workdir schema 与待导入目录计划。"""

    requires_cutover: bool
    workdirs: tuple[V071WorkdirBinding, ...]
    conversations: tuple[V071ConversationBinding, ...]


async def read_v071_workdir_plan(db) -> V071WorkdirMigrationPlan:
    """读取 v0.7.1 或迁移重试所需的目录映射。"""
    conversations_table = bool(await db.scalar(text("SELECT to_regclass('conversations') IS NOT NULL")))
    if not conversations_table:
        return V071WorkdirMigrationPlan(False, (), ())

    unsupported_tables = [
        table_name
        for table_name in ("project_workdirs", "file_storage_materializations")
        if bool(await db.scalar(text(f"SELECT to_regclass('{table_name}') IS NOT NULL")))
    ]
    workdir_column = bool(
        await db.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = current_schema() "
                "AND table_name = 'conversations' AND column_name = 'workdir_id')"
            )
        )
    )
    if workdir_column:
        unsupported_tables.append("conversations.workdir_id")
    if unsupported_tables:
        unsupported = ", ".join(unsupported_tables)
        raise RuntimeError(f"检测到未发布的 Workdir 中间 schema，不支持自动迁移: {unsupported}")

    workdir_path_column = bool(
        await db.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = current_schema() "
                "AND table_name = 'conversations' AND column_name = 'workdir_path')"
            )
        )
    )
    if workdir_path_column:
        raise RuntimeError(
            "检测到未发布的 Conversation.workdir_path 中间 schema；仅支持从 v0.7.1 或当前 Project schema 迁移"
        )

    project_id_column = bool(
        await db.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = current_schema() "
                "AND table_name = 'conversations' AND column_name = 'project_id')"
            )
        )
    )
    conversations: list[V071ConversationBinding] = []
    if project_id_column:
        rows = await db.execute(
            text(
                "SELECT c.thread_id, c.uid, p.workdir_path "
                "FROM conversations AS c "
                "JOIN projects AS p ON p.id = c.project_id AND p.uid = c.uid "
                "ORDER BY c.id"
            )
        )
        for row in rows:
            thread_id = str(row.thread_id)
            if not _legacy_thread_data_exists(thread_id):
                continue
            workdir_id = _current_workdir_id(row.workdir_path)
            if workdir_id is None:
                raise RuntimeError(f"Conversation {thread_id} 的迁移重试路径无效")
            conversations.append(V071ConversationBinding(thread_id, str(row.uid), workdir_id))
    else:
        subagent_table = bool(await db.scalar(text("SELECT to_regclass('subagent_threads') IS NOT NULL")))
        if subagent_table:
            rows = await db.execute(
                text(
                    "SELECT child.thread_id, child.uid, "
                    "COALESCE(parent.thread_id, child.thread_id) AS owner_thread_id, "
                    "COALESCE(parent.uid, child.uid) AS owner_uid "
                    "FROM conversations AS child "
                    "LEFT JOIN subagent_threads AS relation ON relation.child_conversation_id = child.id "
                    "LEFT JOIN conversations AS parent ON parent.id = relation.parent_conversation_id "
                    "ORDER BY child.id"
                )
            )
        else:
            rows = await db.execute(
                text(
                    "SELECT thread_id, uid, thread_id AS owner_thread_id, uid AS owner_uid "
                    "FROM conversations ORDER BY id"
                )
            )
        for row in rows:
            thread_id = str(row.thread_id)
            owner_uid = str(row.owner_uid)
            owner_thread_id = str(row.owner_thread_id)
            workdir_id = str(uuid.UUID(hashlib.md5(f"{owner_uid}:{owner_thread_id}".encode()).hexdigest()))
            conversations.append(V071ConversationBinding(thread_id, str(row.uid), workdir_id))

    owners: dict[str, str] = {}
    for item in conversations:
        owner = owners.setdefault(item.workdir_id, item.uid)
        if owner != item.uid:
            raise RuntimeError("旧 Workdir 被不同用户引用，拒绝迁移")
    return V071WorkdirMigrationPlan(
        not project_id_column,
        tuple(V071WorkdirBinding(workdir_id, uid) for workdir_id, uid in sorted(owners.items())),
        tuple(conversations),
    )


def import_v071_workdirs(
    workdirs: tuple[V071WorkdirBinding, ...],
    conversations: tuple[V071ConversationBinding, ...],
) -> None:
    """原子导入旧目录；所有目标验证成功前保留旧源。"""
    conversations_by_workdir: dict[str, list[V071ConversationBinding]] = {}
    for conversation in conversations:
        conversations_by_workdir.setdefault(conversation.workdir_id, []).append(conversation)

    for binding in workdirs:
        _safe_legacy_component(binding.workdir_id, "Workdir ID")
        ensure_user_workspace(binding.uid)
        workspace_files = Workspace(binding.uid)
        try:
            workspace_files.create_authorized_directory("/", "projects", root="/")
        except FileExistsError:
            pass
        try:
            projects_fd = open_directory_fd(user_workspace_dir(binding.uid), ("projects",))
        except OSError as exc:
            if exc.errno in {errno.ELOOP, errno.ENOTDIR}:
                raise RuntimeError("Workdir 迁移目标 projects 包含 symlink 或非目录组件") from exc
            raise
        projects_root = user_workspace_dir(binding.uid) / "projects"
        target = projects_root / binding.workdir_id
        staging_name = f".import-{binding.workdir_id}-{uuid.uuid4().hex}"
        staging = projects_root / staging_name
        try:
            os.mkdir(staging_name, mode=0o700, dir_fd=projects_fd)
            if target.exists() or target.is_symlink():
                if target.is_symlink() or not target.is_dir():
                    raise RuntimeError(f"Workdir 迁移目标不是安全目录: {binding.workdir_id}")
                _merge_tree(target, staging)
            for conversation in conversations_by_workdir.get(binding.workdir_id, []):
                legacy_user_data = _legacy_thread_user_data(conversation.thread_id)
                if legacy_user_data is None:
                    continue
                for namespace in ("uploads", "outputs"):
                    source = legacy_user_data / namespace
                    if source.exists() or source.is_symlink():
                        _merge_tree(source, staging / namespace)
            staged_manifest = _tree_manifest(staging)
            if target.exists() or target.is_symlink():
                if target.is_symlink() or _tree_manifest(target) != staged_manifest:
                    raise RuntimeError(f"Workdir 迁移目标冲突: {binding.workdir_id}")
                shutil.rmtree(staging)
            else:
                os.replace(staging.name, target.name, src_dir_fd=projects_fd, dst_dir_fd=projects_fd)
            if _tree_manifest(target) != staged_manifest:
                raise RuntimeError(f"Workdir 迁移校验失败: {binding.workdir_id}")
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            os.close(projects_fd)


def cleanup_v071_thread_sources(
    conversations: tuple[V071ConversationBinding, ...],
) -> None:
    """仅在数据库与最终目录验证提交后删除已导入旧源。"""
    for conversation in conversations:
        legacy_user_data = _legacy_thread_user_data(conversation.thread_id)
        if legacy_user_data is None:
            continue
        for namespace in ("uploads", "outputs"):
            source = legacy_user_data / namespace
            if not source.exists() and not source.is_symlink():
                continue
            shutil.rmtree(source)


def _legacy_thread_data_exists(thread_id: str) -> bool:
    root = _legacy_thread_user_data(thread_id)
    if root is None:
        return False
    return any((root / namespace).exists() or (root / namespace).is_symlink() for namespace in ("uploads", "outputs"))


def _legacy_thread_user_data(thread_id: object) -> Path | None:
    """仅为单个安全 POSIX 目录名解析 v0.7.1 Thread 文件根。"""
    value = str(thread_id or "")
    pure = PurePosixPath(value)
    if (
        not value
        or "/" in value
        or pure.is_absolute()
        or len(pure.parts) != 1
        or pure.parts[0] in {".", ".."}
        or "\x00" in value
    ):
        return None
    root = get_legacy_storage_dir() / "threads"
    try:
        directory_fd = open_directory_fd(root, (value, "user-data"))
    except FileNotFoundError:
        return None
    except OSError as exc:
        if exc.errno in {errno.ELOOP, errno.ENOTDIR}:
            raise RuntimeError("旧 Thread 文件根包含 symlink 或非目录组件") from exc
        raise
    else:
        os.close(directory_fd)
    return root / value / "user-data"


def _current_workdir_id(workdir_path: object) -> str | None:
    if not isinstance(workdir_path, str):
        return None
    try:
        normalized = normalize_managed_workdir_path(workdir_path)
    except ValueError:
        return None
    return normalized.removeprefix("projects/")


async def rewrite_v071_workdir_paths(db) -> None:
    """把仍被运行时读取的旧虚拟路径改写到当前 Workdir。"""
    result = await db.execute(
        select(Conversation, Project.workdir_path)
        .join(Project, (Project.id == Conversation.project_id) & (Project.uid == Conversation.uid))
        .order_by(Conversation.id)
    )
    conversations = list(result.all())
    by_id = {conversation.id: (conversation, workdir_path) for conversation, workdir_path in conversations}
    for conversation, workdir_path in conversations:
        metadata = dict(conversation.extra_metadata or {})
        attachments = metadata.get("attachments")
        if isinstance(attachments, list):
            virtual_workdir = runtime_workdir_path(workdir_path)
            metadata["attachments"] = [
                _rewrite_attachment(virtual_workdir, item) if isinstance(item, dict) else item for item in attachments
            ]
            conversation.extra_metadata = metadata
            flag_modified(conversation, "extra_metadata")

    if not by_id:
        return
    rows = await db.execute(
        select(ToolCall, Message.conversation_id)
        .join(Message, Message.id == ToolCall.message_id)
        .where(Message.conversation_id.in_(list(by_id)), ToolCall.tool_name == "present_artifacts")
    )
    for tool_call, conversation_id in rows.all():
        conversation, workdir_path = by_id[conversation_id]
        tool_input = dict(tool_call.tool_input or {})
        filepaths = tool_input.get("filepaths")
        if isinstance(filepaths, list):
            virtual_workdir = runtime_workdir_path(workdir_path)
            tool_input["filepaths"] = [_rewrite_path(path, virtual_workdir) for path in filepaths]
            tool_call.tool_input = tool_input
    await db.flush()


async def verify_workdir_bindings(db) -> None:
    """回读 Conversation 行与最终目录，确认 schema 和文件一致。"""
    result = await db.execute(
        select(Conversation, Project.workdir_path)
        .join(Project, (Project.id == Conversation.project_id) & (Project.uid == Conversation.uid))
        .where(Conversation.status != "deleted")
    )
    for conversation, workdir_path in result:
        expected_prefix = "projects/"
        if not workdir_path.startswith(expected_prefix):
            continue
        try:
            user_workdir_host_dir(conversation.uid, workdir_path)
        except (OSError, ValueError):
            raise RuntimeError(f"Conversation {conversation.thread_id} 的 Workdir 未完成迁移")


def _rewrite_attachment(workdir_path: str, record: dict) -> dict:
    rewritten = {key: value for key, value in record.items() if key in _CURRENT_ATTACHMENT_FIELDS}
    for field in ("path", "original_path"):
        if field in rewritten:
            rewritten[field] = _rewrite_path(rewritten[field], workdir_path)
    return rewritten


def _rewrite_path(path: object, workdir_path: str) -> object:
    if not isinstance(path, str):
        return path
    old_workspace = "/home/gem/user-data/workspace"
    if path == old_workspace or path.startswith(f"{old_workspace}/"):
        return f"/home/gem/user-data{path[len(old_workspace) :]}"
    for namespace in ("uploads", "outputs"):
        old_root = f"/home/gem/user-data/{namespace}"
        if path == old_root or path.startswith(f"{old_root}/"):
            return f"{workdir_path}{path[len('/home/gem/user-data') :]}"
    return path


def _merge_tree(source: Path, target: Path) -> None:
    if source.is_symlink() or not source.is_dir():
        raise RuntimeError(f"旧 Workdir 来源不是安全目录: {source.name}")
    try:
        target.mkdir(mode=0o700)
    except FileExistsError:
        if target.is_symlink() or not target.is_dir():
            raise RuntimeError(f"Workdir 迁移目标不是安全目录: {target.name}") from None
    for entry in source.iterdir():
        destination = target / entry.name
        if entry.is_symlink():
            link_target = os.readlink(entry)
            if destination.is_symlink() or destination.exists():
                if not destination.is_symlink() or os.readlink(destination) != link_target:
                    raise RuntimeError(f"旧 Workdir 文件冲突: {entry.name}")
            else:
                os.symlink(link_target, destination)
        elif entry.is_dir():
            _merge_tree(entry, destination)
        elif entry.is_file():
            if destination.is_symlink() or destination.exists():
                if (
                    destination.is_symlink()
                    or not destination.is_file()
                    or _file_digest(destination) != _file_digest(entry)
                ):
                    raise RuntimeError(f"旧 Workdir 文件冲突: {entry.name}")
            else:
                shutil.copy2(entry, destination, follow_symlinks=False)
        else:
            raise RuntimeError(f"旧 Workdir 包含非常规文件: {entry.name}")


def _tree_manifest(root: Path) -> tuple[tuple[str, str], ...]:
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError("Workdir manifest 根必须是真实目录")
    entries: list[tuple[str, str]] = []
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            entries.append((relative, f"symlink:{os.readlink(path)}"))
        elif path.is_dir():
            entries.append((relative + "/", ""))
        elif path.is_file():
            entries.append((relative, _file_digest(path)))
        else:
            raise RuntimeError("Workdir manifest 拒绝非常规文件")
    return tuple(entries)


def _file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as buffer:
        while chunk := buffer.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_legacy_component(value: object, label: str) -> str:
    normalized = str(value or "").strip()
    if not _SAFE_LEGACY_ID_RE.fullmatch(normalized):
        raise RuntimeError(f"旧 {label} 包含不安全路径字符")
    return normalized
