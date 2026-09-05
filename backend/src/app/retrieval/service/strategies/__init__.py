"""检索模式策略注册表（ragf-design §14.3：新增模式 = 注册实现，不改编排）。"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from backend.src.app.retrieval.service.strategies.hybrid import retrieve_hybrid
from backend.src.app.retrieval.service.strategies.vector import retrieve_vector

__all__ = ['RETRIEVE_STRATEGIES']

RetrieveStrategy = Callable[[dict[str, Any]], Awaitable[list[dict[str, Any]]]]

RETRIEVE_STRATEGIES: dict[str, RetrieveStrategy] = {
    'vector': retrieve_vector,
    'hybrid': retrieve_hybrid,
}
