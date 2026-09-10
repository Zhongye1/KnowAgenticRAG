"""DashScope（千问平台）SDK 客户端（ragf-design D11 扩展：平台 token 统一通道）。

按平台 SDK 调用约定（``import dashscope``）：

- **向量**：``dashscope.MultiModalEmbedding.call(model=..., input=[{'text': ...}])``
  —— 文本（``qwen3.7-text-embedding-flash``）与多模态（``qwen3-vl-embedding``）
  同一 API；``dimension`` 显式传参对齐 Milvus 集合维度。
- **重排**：``dashscope.TextReRank.call(model=..., query=..., documents=...)``
  （``qwen3.7-text-rerank``）。

凭据：``DASHSCOPE_API_KEY``（provider 行 ``api_key_env`` / settings 直配均可达）。
SDK 为可选依赖（视觉 worker 已引入），惰性导入，缺包显式报错。
"""

from __future__ import annotations

import asyncio
import math
import time

from typing import TYPE_CHECKING

from backend.src.common.log import log

if TYPE_CHECKING:
    from types import ModuleType

DASHSCOPE_EMBEDDING_TIMEOUT_SECONDS = 60.0
DASHSCOPE_MAX_RETRIES = 3
# MultiModalEmbedding SDK 单批上限（平台约束）
DASHSCOPE_BATCH_LIMIT = 10

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    if norm <= 0.0:
        return vec
    return [x / norm for x in vec]


class DashScopeError(Exception):
    """DashScope SDK 调用失败（fail-closed）。"""


def _import_dashscope() -> ModuleType:
    try:
        import dashscope  # type: ignore[reportMissingImports]  # 可选依赖
    except ImportError as exc:
        raise DashScopeError('dashscope SDK 未安装（pip install dashscope，千问平台通道）') from exc
    return dashscope


class DashScopeEmbedding:
    """千问平台向量客户端（MultiModalEmbedding，文本与多模态模型同通道）。

    接口与 ``OpenAICompatibleEmbedding`` 对齐（``aencode`` / ``abatch_encode`` /
    ``dimension`` / ``batch_size``），供 ingest / retrieval 透明替换。
    """

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        dimension: int | None = None,
        batch_size: int = DASHSCOPE_BATCH_LIMIT,
    ) -> None:
        self.model = model
        self.api_key = api_key
        self.dimension = int(dimension) if dimension else None
        self.batch_size = max(1, min(int(batch_size), DASHSCOPE_BATCH_LIMIT))

    def _call_sync(self, texts: list[str]) -> list[list[float]]:
        """按 SDK 单批上限分批调用（调用方无需关心批次）。"""
        dashscope = _import_dashscope()
        if not self.api_key:
            raise DashScopeError('DASHSCOPE_API_KEY 未配置（provider api_key / api_key_env）')
        result: list[list[float]] = []
        for start in range(0, len(texts), self.batch_size):
            result.extend(self._call_batch_sync(dashscope, texts[start : start + self.batch_size]))
        return result

    def _call_batch_sync(self, dashscope: ModuleType, batch: list[str]) -> list[list[float]]:
        last_err: Exception | None = None
        for attempt in range(DASHSCOPE_MAX_RETRIES):
            try:
                resp = dashscope.MultiModalEmbedding.call(
                    model=self.model,
                    input=[{'text': text} for text in batch],
                    api_key=self.api_key,
                    dimension=self.dimension,
                )
            except Exception as exc:
                last_err = exc
                log.warning(
                    'DashScope MultiModalEmbedding 第 {}/{} 次调用失败: {}', attempt + 1, DASHSCOPE_MAX_RETRIES, exc
                )
                if attempt + 1 < DASHSCOPE_MAX_RETRIES:
                    time.sleep(min(2**attempt, 5.0))
                continue

            status = getattr(resp, 'status_code', None)
            if status == 200:
                return self._parse_embeddings(resp, expected=len(batch))
            if status in _RETRYABLE_STATUS:
                last_err = RuntimeError(f'DashScope MultiModalEmbedding status={status}: {resp}')
                log.warning('DashScope 第 {}/{} 次调用返回 {}', attempt + 1, DASHSCOPE_MAX_RETRIES, status)
                if attempt + 1 < DASHSCOPE_MAX_RETRIES:
                    time.sleep(min(2**attempt, 5.0))
                continue
            raise DashScopeError(f'DashScope MultiModalEmbedding 失败 status={status}: {resp}')

        raise DashScopeError(f'DashScope MultiModalEmbedding 重试耗尽: {last_err}') from last_err

    def _parse_embeddings(self, resp: object, *, expected: int) -> list[list[float]]:
        output = getattr(resp, 'output', None) or {}
        raw = output.get('embeddings') or [] if isinstance(output, dict) else getattr(output, 'embeddings', None) or []
        by_index: dict[int, list[float]] = {}
        for item in raw:
            if isinstance(item, dict):
                idx = int(item.get('index', len(by_index)))
                emb = item.get('embedding')
            else:
                idx = int(getattr(item, 'index', len(by_index)))
                emb = getattr(item, 'embedding', None)
            if emb is None:
                raise DashScopeError(f'DashScope embedding 缺失 index={idx}')
            vec = [float(x) for x in emb]
            if self.dimension and len(vec) != self.dimension:
                raise DashScopeError(f'DashScope embedding dim={len(vec)} != 配置 dim={self.dimension}')
            by_index[idx] = _l2_normalize(vec)
        missing = [i for i in range(expected) if i not in by_index]
        if missing:
            raise DashScopeError(f'DashScope embedding 响应缺失下标: {missing}')
        return [by_index[i] for i in range(expected)]

    async def aencode(self, texts: list[str] | str) -> list[list[float]]:
        """编码一批文本（超过 SDK 单批上限自动分批）。"""
        messages = [texts] if isinstance(texts, str) else [t for t in texts if t]
        if not messages:
            return []
        result: list[list[float]] = []
        for start in range(0, len(messages), self.batch_size):
            batch = messages[start : start + self.batch_size]
            log.debug('DashScope embedding [{}:{}] model={}', start, start + len(batch), self.model)
            result.extend(await asyncio.to_thread(self._call_sync, batch))
        return result

    async def abatch_encode(self, texts: list[str], batch_size: int | None = None) -> list[list[float]]:
        """分批编码（兼容上层调用约定；SDK 批上限内已分批）。"""
        return await self.aencode(texts)

    async def test_connection(self) -> tuple[bool, str]:
        try:
            embeddings = await self.aencode(['Hello world'])
        except Exception as exc:
            return False, str(exc)
        actual = len(embeddings[0]) if embeddings else 0
        if self.dimension and actual != int(self.dimension):
            return False, f'Embedding 维度不一致：配置 {self.dimension}，实际 {actual}'
        return True, '连接正常'


class DashScopeTextReRank:
    """千问平台重排客户端（``dashscope.TextReRank.call``，qwen3.7-text-rerank）。

    接口与 ``BaseReranker`` 对齐（``acompute_score`` / ``test_connection``）；
    SDK 同步调用经线程池包装。重排分数已是 0..1，不再二次 sigmoid（保显示值）。
    """

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        batch_size: int = 32,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.model = model
        self.api_key = api_key
        self.batch_size = max(1, int(batch_size))
        self.timeout_seconds = timeout_seconds

    def _call_sync(self, query: str, documents: list[str]) -> list[float]:
        dashscope = _import_dashscope()
        if not self.api_key:
            raise DashScopeError('DASHSCOPE_API_KEY 未配置（provider api_key / api_key_env）')
        resp = dashscope.TextReRank.call(
            model=self.model,
            query=query,
            documents=documents,
            top_n=len(documents),
            return_documents=False,
            api_key=self.api_key,
            timeout=self.timeout_seconds,
        )
        status = getattr(resp, 'status_code', None)
        if status != 200:
            raise DashScopeError(f'DashScope TextReRank 失败 status={status}: {resp}')
        output = getattr(resp, 'output', None) or {}
        raw = output.get('results') or [] if isinstance(output, dict) else getattr(output, 'results', None) or []
        by_index: dict[int, float] = {}
        for item in raw:
            if isinstance(item, dict):
                idx = int(item.get('index', len(by_index)))
                score = item.get('relevance_score')
            else:
                idx = int(getattr(item, 'index', len(by_index)))
                score = getattr(item, 'relevance_score', None)
            if score is None:
                raise DashScopeError(f'DashScope TextReRank 结果缺失 index={idx}')
            by_index[idx] = float(score)
        missing = [i for i in range(len(documents)) if i not in by_index]
        if missing:
            raise DashScopeError(f'DashScope TextReRank 响应缺失下标: {missing}')
        return [by_index[i] for i in range(len(documents))]

    async def _batch_rerank(self, query: str, documents: list[str]) -> list[float]:
        if not query or not documents:
            return []
        return await asyncio.to_thread(self._call_sync, query, documents)

    async def acompute_score(
        self,
        query: str,
        documents: list[str],
        *,
        normalize: bool = True,
        batch_size: int | None = None,
    ) -> list[float]:
        """逐批精排打分；批次失败向上抛（不静默降级，D16 同约定）。"""
        size = max(1, batch_size or self.batch_size)
        scores: list[float] = []
        for start in range(0, len(documents), size):
            batch = documents[start : start + size]
            scores.extend(await self._batch_rerank(query, batch))
        return scores

    async def aclose(self) -> None:
        """资源释放（SDK 无长连客户端，空操作；对齐 BaseReranker 调用约定）。"""

    async def test_connection(self) -> tuple[bool, str]:
        try:
            scores = await self._batch_rerank('test query', ['test document'])
        except Exception as exc:
            return False, str(exc)
        if scores:
            return True, '连接正常'
        return False, '响应无效'
