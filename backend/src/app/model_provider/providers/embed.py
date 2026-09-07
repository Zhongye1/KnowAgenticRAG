"""Embedding 模型客户端（OpenAI 兼容通道，ragf-design D11/D17）。

模型走 ModelScope ``api-inference``（OpenAI 兼容 ``/embeddings``）；
URL 推断：base_url 以 ``/embeddings`` 结尾则直接用，否则拼接。批大小默认 200
（D17），可由 ModelInfo（模型行 extra/batch_size）覆盖。
"""

from __future__ import annotations

import asyncio

import httpx

from backend.src.common.log import log

EMBEDDING_TIMEOUT_SECONDS = 60.0
EMBEDDING_MAX_RETRIES = 3
EMBEDDING_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

HF_INFERENCE_BASE_URL = 'https://router.huggingface.co/hf-inference'


def normalize_hf_embeddings(result: object) -> list[list[float]]:
    """HF feature-extraction 响应归一为向量列表。

    兼容三种形态：批次向量 ``[[f], [f]]``、单条向量 ``[f]``、dict 包装
    （``{"embeddings": ...}``）；个别模型还会多包一层（``[[[f]]]``）。
    """
    if isinstance(result, dict):
        data = result.get('embeddings', result.get('data'))
        if data is None:
            raise ValueError(f'Embedding 响应缺少 embeddings 字段: {result}')
        return normalize_hf_embeddings(data)
    if not isinstance(result, list) or not result:
        raise ValueError(f'Embedding 响应格式无效: {type(result)}')
    if isinstance(result[0], (int, float)):
        return [[float(item) for item in result]]  # 单条文本 → 单向量
    vectors: list[list[float]] = []
    for row in result:
        if not isinstance(row, list) or not row:
            raise ValueError(f'Embedding 响应行格式无效: {type(row)}')
        inner = row[0] if isinstance(row[0], list) else row  # 兼容三层嵌套
        vectors.append([float(item) for item in inner])
    return vectors


def ensure_embeddings_url(base_url: str) -> str:
    url = (base_url or '').rstrip('/')
    if url.endswith('/embeddings'):
        return url
    return f'{url}/embeddings'


class OpenAICompatibleEmbedding:
    """OpenAI 兼容 Embedding 客户端（异步）。"""

    def __init__(
        self,
        *,
        model: str,
        base_url: str,
        api_key: str,
        dimension: int | None = None,
        batch_size: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.model = model
        self.dimension = dimension
        self.batch_size = max(1, int(batch_size))
        self.url = ensure_embeddings_url(base_url)
        self.headers = {'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json', **(headers or {})}
        self.timeout = httpx.Timeout(EMBEDDING_TIMEOUT_SECONDS)

    def _payload(self, texts: list[str]) -> dict:
        return {'model': self.model, 'input': texts}

    @staticmethod
    def _extract_embeddings(result: dict) -> list[list[float]]:
        rows = result.get('data')
        if not isinstance(rows, list) or not rows:
            raise ValueError(f'Embedding 响应无 data 字段: {result}')
        ordered = sorted(rows, key=lambda item: item.get('index', 0))
        return [item['embedding'] for item in ordered]

    async def aencode(self, texts: list[str] | str) -> list[list[float]]:
        messages = [texts] if isinstance(texts, str) else texts
        if not messages:
            return []
        payload = self._payload(messages)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for attempt in range(EMBEDDING_MAX_RETRIES):
                try:
                    response = await client.post(self.url, json=payload, headers=self.headers)
                    response.raise_for_status()
                    return self._extract_embeddings(response.json())
                except httpx.HTTPStatusError as exc:
                    if (
                        exc.response.status_code in EMBEDDING_RETRYABLE_STATUS_CODES
                        and attempt + 1 < EMBEDDING_MAX_RETRIES
                    ):
                        await asyncio.sleep(min(float(2**attempt), 5.0))
                        continue
                    raise ValueError(
                        f'Embedding 请求失败 model={self.model} status={exc.response.status_code}: '
                        f'{exc.response.text[:300]}'
                    ) from exc
                except httpx.RequestError as exc:
                    if attempt + 1 < EMBEDDING_MAX_RETRIES:
                        await asyncio.sleep(min(float(2**attempt), 5.0))
                        continue
                    raise ValueError(f'Embedding 请求失败 model={self.model} url={self.url}: {exc}') from exc
        return []  # pragma: no cover

    async def abatch_encode(self, texts: list[str], batch_size: int | None = None) -> list[list[float]]:
        """分批编码（D17：默认 200，模型级可覆盖）。"""
        size = max(1, batch_size or self.batch_size)
        result: list[list[float]] = []
        for start in range(0, len(texts), size):
            batch = texts[start : start + size]
            log.debug(f'Embedding 编码 [{start}:{start + len(batch)}] model={self.model} bsz={size}')
            result.extend(await self.aencode(batch))
        return result

    async def test_connection(self) -> tuple[bool, str]:
        try:
            embeddings = await self.aencode(['Hello world'])
        except Exception as exc:
            return False, f'{exc}（检查 base_url 是否以 /embeddings 结尾）'
        actual = len(embeddings[0]) if embeddings else 0
        if self.dimension and actual != int(self.dimension):
            return False, f'Embedding 维度不一致：配置 {self.dimension}，实际 {actual}'
        return True, '连接正常'


class HuggingFaceEmbedding(OpenAICompatibleEmbedding):
    """HuggingFace Inference（hf-inference）feature-extraction 客户端。

    端点：``{base}/models/{repo_id}``（base 缺省 hf-inference 路由）；
    payload 为 ``{"inputs": [...]}``，模型名由 URL 携带。响应形态由
    ``normalize_hf_embeddings`` 归一。bge-m3 输出 1024 维向量。
    """

    def __init__(
        self,
        *,
        model: str,
        base_url: str = '',
        api_key: str,
        dimension: int | None = None,
        batch_size: int = 16,
        headers: dict[str, str] | None = None,
        repo_id: str | None = None,
    ) -> None:
        super().__init__(
            model=model,
            base_url=base_url,
            api_key=api_key,
            dimension=dimension,
            batch_size=batch_size,
            headers=headers,
        )
        base = (base_url or HF_INFERENCE_BASE_URL).rstrip('/')
        self.url = f'{base}/models/{repo_id or model}'

    def _payload(self, texts: list[str]) -> dict:
        return {'inputs': texts}

    @staticmethod
    def _extract_embeddings(result: dict) -> list[list[float]]:
        return normalize_hf_embeddings(result)

    async def test_connection(self) -> tuple[bool, str]:
        try:
            embeddings = await self.aencode(['Hello world'])
        except Exception as exc:
            return False, f'{exc}（检查 HF_TOKEN 与模型 {self.model} 是否支持 Inference API）'
        actual = len(embeddings[0]) if embeddings else 0
        if self.dimension and actual != int(self.dimension):
            return False, f'Embedding 维度不一致：配置 {self.dimension}，实际 {actual}'
        return True, '连接正常'
