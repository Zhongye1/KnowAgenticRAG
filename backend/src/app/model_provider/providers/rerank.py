"""Rerank 协议客户端（Yuxi models/rerank.py 移植，ragf-design D16）。

默认 OpenAI 兼容 ``/rerank``（ModelScope 通道）；``rerank_protocol=dashscope``
走 DashScope 协议。批参数为客户端常量：batch_size=32 / max_length=512 /
timeout=30s（D17）。失败不静默填 0.5 —— 由检索层降级为召回序并记录指标
（ragf-design §5.7/§14.9）。
"""

from __future__ import annotations

import math

from abc import ABC, abstractmethod

import httpx

RERANK_TIMEOUT_SECONDS = 30.0
RERANK_BATCH_SIZE = 32
RERANK_MAX_LENGTH = 512


def sigmoid(value: float) -> float:
    try:
        return 1.0 / (1.0 + math.exp(-float(value)))
    except OverflowError:
        return 1.0 if value > 0 else 0.0


def ensure_rerank_url(base_url: str) -> str:
    """OpenAI 兼容 rerank 端点推断：base_url 以 /rerank 结尾则原样，否则拼接。"""
    url = (base_url or '').rstrip('/')
    if url.endswith('/rerank'):
        return url
    return f'{url}/rerank'


class BaseReranker(ABC):
    """CrossEncoder 精排客户端基类。"""

    def __init__(
        self,
        *,
        model: str,
        base_url: str,
        api_key: str,
        headers: dict[str, str] | None = None,
        batch_size: int = RERANK_BATCH_SIZE,
        max_length: int = RERANK_MAX_LENGTH,
    ) -> None:
        self.model = model
        self.api_key = api_key
        self.batch_size = max(1, batch_size)
        self.max_length = max_length
        self.headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json', **(headers or {})}
        self.timeout = httpx.Timeout(RERANK_TIMEOUT_SECONDS)
        self._client: httpx.AsyncClient | None = None

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    @property
    @abstractmethod
    def url(self) -> str:
        """完整请求 URL（协议类决定是否拼 /rerank）。"""

    @abstractmethod
    def _build_payload(self, query: str, documents: list[str]) -> dict:
        raise NotImplementedError

    @abstractmethod
    def _extract_results(self, result: dict) -> list[dict]:
        raise NotImplementedError

    async def _batch_rerank(self, query: str, documents: list[str]) -> list[float]:
        client = await self._ensure_client()
        payload = self._build_payload(query, documents)
        response = await client.post(self.url, json=payload, headers=self.headers)
        response.raise_for_status()
        result = response.json()
        processed = sorted(self._extract_results(result), key=lambda item: item.get('index', 0))
        return [float(entry.get('relevance_score', 0.0)) for entry in processed]

    async def acompute_score(
        self,
        query: str,
        documents: list[str],
        *,
        normalize: bool = True,
        batch_size: int | None = None,
    ) -> list[float]:
        """逐批精排打分；批次失败向上抛（不静默降级）。"""
        if not query or not documents:
            return []
        size = max(1, batch_size or self.batch_size)
        scores: list[float] = []
        for start in range(0, len(documents), size):
            batch = documents[start : start + size]
            scores.extend(await self._batch_rerank(query, batch))
        if normalize:
            scores = [float(sigmoid(score)) for score in scores]
        return scores

    async def test_connection(self) -> tuple[bool, str]:
        try:
            scores = await self._batch_rerank('test query', ['test document'])
        except Exception as exc:
            return False, str(exc)
        finally:
            await self.aclose()
        if scores:
            return True, '连接正常'
        return False, '响应无效'

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None


class OpenAIReranker(BaseReranker):
    """OpenAI 兼容 /rerank 协议（默认，D16）。"""

    def __init__(self, **kwargs) -> None:
        self._url = ensure_rerank_url(str(kwargs.pop('base_url') or ''))
        super().__init__(**kwargs)

    @property
    def url(self) -> str:
        return self._url

    def _build_payload(self, query: str, documents: list[str]) -> dict:
        return {'model': self.model, 'query': query, 'documents': documents, 'max_chunks_per_doc': self.max_length}

    def _extract_results(self, result: dict) -> list[dict]:
        return list(result.get('results', []))


class DashscopeReranker(BaseReranker):
    """DashScope rerank 协议（备选通道，D16）。"""

    def __init__(self, **kwargs) -> None:
        self._url = (str(kwargs.pop('base_url') or '')).rstrip('/')
        super().__init__(**kwargs)

    @property
    def url(self) -> str:
        return self._url

    def _build_payload(self, query: str, documents: list[str]) -> dict:
        params: dict = {'top_n': len(documents), 'return_documents': False}
        instruct = self.headers.get('x-dashscope-instruct')
        if instruct:
            params['instruct'] = instruct
        return {'model': self.model, 'input': {'query': query, 'documents': documents}, 'parameters': params}

    def _extract_results(self, result: dict) -> list[dict]:
        return list((result.get('output') or {}).get('results', []))
