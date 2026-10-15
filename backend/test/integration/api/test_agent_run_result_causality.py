"""AgentRun 结果接口的消息因果归属集成测试。"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ars.storage.postgres.models_business import APIKey, AgentRun, Conversation, Department, Message, Project, User
from ars.utils.auth_utils import AuthUtils

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_langfuse_link_requires_superadmin(test_client, standard_user):
    response = await test_client.get(
        "/api/agent/runs/nonexistent/langfuse",
        headers=standard_user["headers"],
    )

    assert response.status_code == 403, response.text


async def test_run_observability_api_never_reads_another_runs_assistant_message(test_client):
    """结果与 Langfuse 入口都只能读取当前 Run 的 assistant 消息。"""
    unique = uuid.uuid4().hex
    uid = f"pytest_output_{unique[:16]}"
    thread_id = f"pytest-output-{unique}"
    exact_run_id = f"exact-{unique}"
    wrong_run_id = f"wrong-{unique}"
    legacy_run_id = f"legacy-{unique}"
    run_ids = [exact_run_id, wrong_run_id, legacy_run_id]

    engine = create_async_engine(os.environ["POSTGRES_URL"], pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    conversation_id: int | None = None
    department_id: int | None = None
    user_id: int | None = None
    other_user_id: int | None = None
    api_key_id: int | None = None
    other_api_key_id: int | None = None
    project_id: str | None = None

    try:
        async with session_factory() as db:
            department = Department(name=f"pytest-output-{unique[:16]}")
            db.add(department)
            await db.flush()
            department_id = department.id

            user = User(
                username=uid,
                uid=uid,
                password_hash="integration-api-key-only",
                role="superadmin",
                department_id=department.id,
            )
            db.add(user)
            await db.flush()
            user_id = user.id

            api_key_secret, key_hash, key_prefix = AuthUtils.generate_api_key()
            api_key = APIKey(
                key_hash=key_hash,
                key_prefix=key_prefix,
                name="pytest output causality",
                user_id=user.id,
                department_id=department.id,
                created_by=uid,
            )
            db.add(api_key)
            await db.flush()
            api_key_id = api_key.id

            other_uid = f"pytest_output_other_{unique[:10]}"
            other_user = User(
                username=other_uid,
                uid=other_uid,
                password_hash="integration-api-key-only",
                role="superadmin",
                department_id=department.id,
            )
            db.add(other_user)
            await db.flush()
            other_user_id = other_user.id

            other_api_key_secret, other_key_hash, other_key_prefix = AuthUtils.generate_api_key()
            other_api_key = APIKey(
                key_hash=other_key_hash,
                key_prefix=other_key_prefix,
                name="pytest output causality other user",
                user_id=other_user.id,
                department_id=department.id,
                created_by=other_uid,
            )
            db.add(other_api_key)
            await db.flush()
            other_api_key_id = other_api_key.id

            project_id = str(uuid.uuid4())
            db.add(
                Project(
                    id=project_id,
                    uid=uid,
                    selection_status="implicit",
                    workdir_path=f"projects/{project_id}",
                    directory_mode="managed",
                )
            )
            await db.flush()
            conversation = Conversation(
                thread_id=thread_id,
                uid=uid,
                project_id=project_id,
                agent_id="pytest-output-causality",
                status="active",
            )
            runs = [
                AgentRun(
                    id=run_id,
                    conversation_thread_id=thread_id,
                    runtime_scope_id=thread_id,
                    agent_slug="pytest-output-causality",
                    uid=uid,
                    status="completed",
                    request_id=f"request-{run_id}",
                    conversation_id=None,
                    run_type="chat",
                    input_payload={},
                )
                for run_id in run_ids
            ]
            db.add(conversation)
            await db.flush()
            conversation_id = conversation.id
            for run in runs:
                run.conversation_id = conversation.id
            db.add_all(runs)
            await db.flush()

            created_at = datetime(2026, 8, 15, 12, 0, 0)
            exact_message = Message(
                conversation_id=conversation.id,
                run_id=exact_run_id,
                role="assistant",
                content="exact run output",
                extra_metadata={"langfuse_trace_id": "trace-exact"},
                created_at=created_at + timedelta(seconds=3),
            )
            wrong_runs_own_message = Message(
                conversation_id=conversation.id,
                run_id=wrong_run_id,
                role="assistant",
                content="wrong run own compatibility candidate",
                extra_metadata={"langfuse_trace_id": "trace-wrong"},
                created_at=created_at + timedelta(seconds=4),
            )
            legacy_old_message = Message(
                conversation_id=conversation.id,
                run_id=legacy_run_id,
                role="assistant",
                content="legacy old output",
                created_at=created_at,
            )
            legacy_latest_message = Message(
                conversation_id=conversation.id,
                run_id=legacy_run_id,
                role="assistant",
                content="legacy latest output",
                created_at=created_at + timedelta(seconds=1),
            )
            db.add_all([exact_message, wrong_runs_own_message, legacy_old_message, legacy_latest_message])
            await db.flush()

            runs[0].output_message_id = exact_message.id
            # 故意把 wrong Run 指向另一个 Run 的消息；即使自己有兼容候选，也不能 fallback。
            runs[1].output_message_id = exact_message.id
            runs[2].output_message_id = None
            exact_message_id = exact_message.id
            legacy_latest_message_id = legacy_latest_message.id
            await db.commit()

        headers = {"Authorization": f"Bearer {api_key_secret}"}
        profile_response = await test_client.get("/api/auth/me", headers=headers)
        assert profile_response.status_code == 200, profile_response.text
        assert profile_response.json()["uid"] == uid

        exact_response = await test_client.get(
            f"/api/agent/runs/{exact_run_id}/result",
            headers=headers,
        )
        wrong_response = await test_client.get(
            f"/api/agent/runs/{wrong_run_id}/result",
            headers=headers,
        )
        legacy_response = await test_client.get(
            f"/api/agent/runs/{legacy_run_id}/result",
            headers=headers,
        )
        wrong_langfuse_response = await test_client.get(
            f"/api/agent/runs/{wrong_run_id}/langfuse",
            headers=headers,
        )
        other_user_response = await test_client.get(
            f"/api/agent/runs/{exact_run_id}/langfuse",
            headers={"Authorization": f"Bearer {other_api_key_secret}"},
        )

        assert exact_response.status_code == 200, exact_response.text
        assert exact_response.json()["output"] == "exact run output"
        assert exact_response.json()["final_message_id"] == exact_message_id

        assert wrong_response.status_code == 200, wrong_response.text
        assert wrong_response.json()["output"] == ""
        assert wrong_response.json()["final_message_id"] is None

        assert legacy_response.status_code == 200, legacy_response.text
        assert legacy_response.json()["output"] == "legacy latest output"
        assert legacy_response.json()["final_message_id"] == legacy_latest_message_id

        assert wrong_langfuse_response.status_code == 200, wrong_langfuse_response.text
        assert wrong_langfuse_response.json() == {
            "run_id": wrong_run_id,
            "available": False,
            "reason": "trace_not_available",
        }
        assert other_user_response.status_code == 404, other_user_response.text
        assert "trace" not in other_user_response.text.lower()
    finally:
        async with session_factory() as db:
            if conversation_id is not None:
                await db.execute(delete(Message).where(Message.conversation_id == conversation_id))
            await db.execute(delete(AgentRun).where(AgentRun.id.in_(run_ids)))
            if conversation_id is not None:
                await db.execute(delete(Conversation).where(Conversation.id == conversation_id))
            if project_id is not None:
                await db.execute(delete(Project).where(Project.id == project_id))
            api_key_ids = [item for item in (api_key_id, other_api_key_id) if item is not None]
            if api_key_ids:
                await db.execute(delete(APIKey).where(APIKey.id.in_(api_key_ids)))
            user_ids = [item for item in (user_id, other_user_id) if item is not None]
            if user_ids:
                await db.execute(delete(User).where(User.id.in_(user_ids)))
            if department_id is not None:
                await db.execute(delete(Department).where(Department.id == department_id))
            await db.commit()
        await engine.dispose()
