from types import SimpleNamespace

import pytest
from ars.agents.base import BaseAgent


@pytest.mark.asyncio
async def test_base_agent_uses_and_caches_postgres_checkpointer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Agent 只从 PostgreSQL manager 取得并缓存 checkpointer。"""
    agent = object.__new__(BaseAgent)
    agent.checkpointer = None
    saver = object()
    manager = SimpleNamespace(get_langgraph_checkpointer=lambda: saver)
    monkeypatch.setattr("ars.agents.base.pg_manager", manager)

    assert await agent._get_checkpointer() is saver
    assert await agent._get_checkpointer() is saver
