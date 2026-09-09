"""检索域端口（ragf-design §14.2：消费方定义 Port，实现方供 Adapter）。

- ``EmbeddingPort`` / ``RerankPort``：实现方 = ``app/model_provider`` 模型客户端
  （``OpenAICompatibleEmbedding`` / ``BaseReranker`` 结构满足本协议，检索域不
  直接 import 其实现模块）；
- ``ChunkSourcePort``：实现方 = kb 域只读契约适配器（chunks/documents），默认
  实现见 ``retrieval_service.PgChunkSource``。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['ChunkSourcePort', 'EmbeddingPort', 'RerankPort']


class EmbeddingPort(Protocol):
    """Embedding 客户端最小契约（aencode 单次/整批编码均可）。"""

    model: str
    dimension: int | None

    async def aencode(self, texts: list[str] | str) -> list[list[float]]: ...


class RerankPort(Protocol):
    """CrossEncoder 精排客户端最小契约。"""

    async def acompute_score(
        self,
        query: str,
        documents: list[str],
        *,
        normalize: bool = True,
        batch_size: int | None = None,
    ) -> list[float]: ...

    async def aclose(self) -> None: ...


class ChunkSourcePort(Protocol):
    """来源补全端口：按命中 chunk 补全 PG 事实源与文件名。"""

    async def hydrate(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        hits: list[dict[str, Any]],
        plugin_namespace: str | None = None,
    ) -> dict[str, Any]: ...
