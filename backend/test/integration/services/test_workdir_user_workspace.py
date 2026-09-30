"""真实 PostgreSQL 与文件系统上的 Workdir/UserWorkspace 契约。"""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.workspace.paths import ensure_bound_user_workdir
from ars.repositories.conversation_repository import ConversationRepository
from ars.storage_migrations.v071_workdirs import (
    cleanup_v071_thread_sources,
    import_v071_workdirs,
    read_v071_workdir_plan,
    rewrite_v071_workdir_paths,
    verify_workdir_bindings,
)
from ars.storage.postgres.manager import (
    V071_WORKDIR_CUTOVER_STATEMENTS,
    WORKDIR_PATH_SCHEMA_STATEMENTS,
)
from ars.storage.postgres.models_business import Base, Conversation, Project

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_conversations_share_workdir_only_through_project(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "user-data"))
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as db:
            first_path = f"projects/{uuid.uuid4()}"
            ensure_bound_user_workdir("user-1", first_path)
            project = Project(
                id=str(uuid.uuid4()),
                uid="user-1",
                selection_status="implicit",
                workdir_path=first_path,
                directory_mode="managed",
            )
            db.add(project)
            await db.flush()
            first = await ConversationRepository(db).add_conversation(
                uid="user-1",
                agent_id="main",
                thread_id="thread-1",
                project_id=project.id,
            )
            await db.commit()
            assert first.project_id == project.id
            assert not hasattr(first, "workdir_path")
            first_directory = tmp_path / "user-data" / "shared" / "user-1" / "workspace" / first_path
            assert first_directory.is_dir()

            second = await ConversationRepository(db).add_conversation(
                uid="user-1",
                agent_id="main",
                thread_id="thread-2",
                project_id=project.id,
            )
            await db.commit()
            assert second.project_id == first.project_id
    finally:
        await engine.dispose()


async def test_unreleased_workdir_schema_is_rejected():
    schema_name = f"pytest_workdir_cutover_{uuid.uuid4().hex}"
    admin_engine = create_async_engine(os.environ["POSTGRES_URL"], pool_pre_ping=True)
    engine = create_async_engine(
        os.environ["POSTGRES_URL"],
        pool_pre_ping=True,
        connect_args={"server_settings": {"search_path": schema_name}},
    )
    try:
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema_name}"'))
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            await connection.execute(text("ALTER TABLE conversations ADD COLUMN workdir_id VARCHAR(64)"))

        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as db:
            with pytest.raises(RuntimeError, match="未发布的 Workdir 中间 schema"):
                await read_v071_workdir_plan(db)
    finally:
        await engine.dispose()
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
        await admin_engine.dispose()


async def test_v071_thread_layout_migrates_files_empty_workdir_and_attachment_metadata(monkeypatch, tmp_path: Path):
    schema_name = f"pytest_thread_cutover_{uuid.uuid4().hex}"
    admin_engine = create_async_engine(os.environ["POSTGRES_URL"], pool_pre_ping=True)
    engine = create_async_engine(
        os.environ["POSTGRES_URL"],
        pool_pre_ping=True,
        connect_args={"server_settings": {"search_path": schema_name}},
    )
    legacy_storage = tmp_path / "legacy"
    source = legacy_storage / "threads/thread-early/user-data/uploads"
    source.mkdir(parents=True)
    (source / "input.txt").write_text("early-layout", encoding="utf-8")
    punctuation_source = legacy_storage / "threads/thread.v0:legacy/user-data/outputs"
    punctuation_source.mkdir(parents=True)
    (punctuation_source / "result.txt").write_text("punctuation", encoding="utf-8")
    monkeypatch.setattr(
        "ars.storage_migrations.v071_workdirs.get_legacy_storage_dir",
        lambda: legacy_storage,
    )
    monkeypatch.setenv("ARS_USER_DATA_DIR", str(tmp_path / "user-data"))

    try:
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema_name}"'))
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            await connection.execute(text("ALTER TABLE conversations DROP CONSTRAINT fk_conversations_project_uid"))
            await connection.execute(text("ALTER TABLE conversations DROP COLUMN project_id"))
            await connection.execute(
                text(
                    "INSERT INTO users (username, uid, password_hash, role, login_failed_count, is_deleted) "
                    "VALUES ('user-early', 'user-early', 'unused', 'user', 0, 0)"
                )
            )
            await connection.execute(
                text(
                    "INSERT INTO conversations "
                    "(thread_id, uid, agent_id, status, is_pinned, extra_metadata) "
                    "VALUES ('thread-early', 'user-early', 'main', 'active', false, CAST(:metadata AS JSONB)), "
                    "('thread-empty', 'user-early', 'main', 'active', false, '{}'), "
                    "('thread.v0:legacy', 'user-early', 'main', 'active', false, '{}')"
                ),
                {
                    "metadata": json.dumps(
                        {
                            "attachments": [
                                {
                                    "file_id": "f1",
                                    "file_name": "input.txt",
                                    "file_type": "text/plain",
                                    "file_size": 12,
                                    "status": "uploaded",
                                    "uploaded_at": "2026-01-01T00:00:00Z",
                                    "path": "/home/gem/user-data/uploads/input.txt",
                                    "original_path": "/home/gem/user-data/uploads/input.txt",
                                    "storage_path": ("/app/saves/threads/thread-early/user-data/uploads/input.txt"),
                                    "markdown": "legacy copy",
                                    "artifact_url": "/api/old",
                                }
                            ]
                        }
                    )
                },
            )

        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as db:
            plan = await read_v071_workdir_plan(db)
        expected_id = str(uuid.UUID(hashlib.md5(b"user-early:thread-early").hexdigest()))
        empty_id = str(uuid.UUID(hashlib.md5(b"user-early:thread-empty").hexdigest()))
        punctuation_id = str(uuid.UUID(hashlib.md5(b"user-early:thread.v0:legacy").hexdigest()))
        assert plan.requires_cutover is True
        assert {(binding.workdir_id, binding.uid) for binding in plan.workdirs} == {
            (empty_id, "user-early"),
            (expected_id, "user-early"),
            (punctuation_id, "user-early"),
        }

        with pytest.raises(DBAPIError, match="storage-migrator cutover"):
            async with engine.begin() as connection:
                for statement in WORKDIR_PATH_SCHEMA_STATEMENTS:
                    await connection.execute(text(statement))

        import_v071_workdirs(plan.workdirs, plan.conversations)
        async with engine.begin() as connection:
            for statement in V071_WORKDIR_CUTOVER_STATEMENTS:
                await connection.execute(text(statement))
        async with factory() as db:
            await rewrite_v071_workdir_paths(db)
            await verify_workdir_bindings(db)
            await db.commit()

        async with factory() as db:
            retry_plan = await read_v071_workdir_plan(db)
        assert retry_plan.requires_cutover is False
        assert [binding.workdir_id for binding in retry_plan.workdirs] == [expected_id, punctuation_id]
        import_v071_workdirs(retry_plan.workdirs, retry_plan.conversations)
        cleanup_v071_thread_sources(retry_plan.conversations)

        async with factory() as db:
            rows = list(
                (
                    await db.execute(
                        select(Conversation, Project.workdir_path)
                        .join(Project, Project.id == Conversation.project_id)
                        .order_by(Conversation.id)
                    )
                ).all()
            )
            conversations = [conversation for conversation, _workdir_path in rows]

        target = tmp_path / f"user-data/shared/user-early/workspace/projects/{expected_id}/uploads/input.txt"
        assert target.read_text(encoding="utf-8") == "early-layout"
        empty_target = tmp_path / f"user-data/shared/user-early/workspace/projects/{empty_id}"
        assert empty_target.is_dir()
        assert list(empty_target.iterdir()) == []
        punctuation_target = (
            tmp_path / f"user-data/shared/user-early/workspace/projects/{punctuation_id}/outputs/result.txt"
        )
        assert punctuation_target.read_text(encoding="utf-8") == "punctuation"
        assert [workdir_path for _conversation, workdir_path in rows] == [
            f"projects/{expected_id}",
            f"projects/{empty_id}",
            f"projects/{punctuation_id}",
        ]
        assert conversations[0].extra_metadata["attachments"] == [
            {
                "file_id": "f1",
                "file_name": "input.txt",
                "file_type": "text/plain",
                "file_size": 12,
                "status": "uploaded",
                "uploaded_at": "2026-01-01T00:00:00Z",
                "path": f"/home/gem/user-data/projects/{expected_id}/uploads/input.txt",
                "original_path": f"/home/gem/user-data/projects/{expected_id}/uploads/input.txt",
            }
        ]
        assert not source.exists()
    finally:
        await engine.dispose()
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
        await admin_engine.dispose()
