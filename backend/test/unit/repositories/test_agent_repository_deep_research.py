from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from ars.repositories.agent_repository import (
    AgentRepository,
    DEEP_RESEARCH_AGENT_SLUG,
    DEFAULT_AGENT_BACKEND_ID,
    FACT_VERIFIER_AGENT_SLUG,
    RESEARCH_EXPLORER_AGENT_SLUG,
    SUB_AGENT_BACKEND_ID,
)


class CollectingDb:
    def __init__(self):
        self.added: list = []
        self.commit = AsyncMock()
        self.refresh = AsyncMock()

    def add(self, item):
        self.added.append(item)


@pytest.mark.asyncio
async def test_ensure_deep_research_agents_creates_orchestrator_and_subagents(monkeypatch):
    db = CollectingDb()
    repo = AgentRepository(db)

    async def get_by_slug(_slug):
        return None

    monkeypatch.setattr(repo, "get_by_slug", get_by_slug)

    await repo.ensure_deep_research_agents()

    created = {agent.slug: agent for agent in db.added}
    assert set(created) == {
        DEEP_RESEARCH_AGENT_SLUG,
        RESEARCH_EXPLORER_AGENT_SLUG,
        FACT_VERIFIER_AGENT_SLUG,
    }

    explorer = created[RESEARCH_EXPLORER_AGENT_SLUG]
    verifier = created[FACT_VERIFIER_AGENT_SLUG]
    assert explorer.backend_id == SUB_AGENT_BACKEND_ID and explorer.is_subagent is True
    assert verifier.backend_id == SUB_AGENT_BACKEND_ID and verifier.is_subagent is True

    orchestrator = created[DEEP_RESEARCH_AGENT_SLUG]
    assert orchestrator.backend_id == DEFAULT_AGENT_BACKEND_ID
    assert orchestrator.is_subagent is False
    assert orchestrator.is_default is False
    context = orchestrator.config_json["context"]
    assert context["subagents"] == [RESEARCH_EXPLORER_AGENT_SLUG, FACT_VERIFIER_AGENT_SLUG]
    assert context["skills"] == [DEEP_RESEARCH_AGENT_SLUG]
    assert context["system_prompt"].strip()


@pytest.mark.asyncio
async def test_ensure_deep_research_agents_is_idempotent(monkeypatch):
    db = CollectingDb()
    repo = AgentRepository(db)

    async def get_by_slug(slug):
        return SimpleNamespace(slug=slug)

    monkeypatch.setattr(repo, "get_by_slug", get_by_slug)

    await repo.ensure_deep_research_agents()

    assert db.added == []
    db.commit.assert_not_awaited()
