"""视觉编码客户端（双管线摄取 spec D7，EagleRAG ingest/visual_encoder.py 迁移；
自 ingest/engine 下沉至模型接入域：摄取写入与检索查询两侧共用同一向量空间）。

图片与文本共享同一向量空间（Qwen3-VL-Embedding，2048 维）。P2 接入
DashScope 百炼 provider（免 GPU）；本地 HF provider 为 P4 可选项（显式报错）。

约束（spec D7）：摄取与查询必须使用同一 provider；切换 provider 需重建
ragf_visual 集合，代码侧以指纹守卫（见 database/milvus_visual_ops._fingerprint）。
"""

from __future__ import annotations

import base64
import math
import os
import time

from typing import Any, Protocol

from backend.src.common.log import log

__all__ = ['DashScopeQwen3VLEncoder', 'VisualEncoder', 'get_visual_encoder']

_DASHSCOPE_DIMS = frozenset({256, 512, 768, 1024, 1536, 2048, 2560})
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class VisualEncoder(Protocol):
    """图片/文本统一嵌入协议。"""

    def embed_image(self, image_bytes: bytes) -> list[float]: ...

    def embed_text(self, text: str) -> list[float]: ...

    def embed_images(self, images: list[bytes]) -> list[list[float]]: ...


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    if norm <= 0.0:
        return vec
    return [x / norm for x in vec]


def _image_mime(image_bytes: bytes) -> str:
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        return 'png'
    if len(image_bytes) >= 12 and image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
        return 'webp'
    if image_bytes[:2] == b'\xff\xd8':
        return 'jpeg'
    if image_bytes[:3] == b'GIF':
        return 'gif'
    if image_bytes[:2] == b'BM':
        return 'bmp'
    return 'jpeg'


def _image_data_uri(image_bytes: bytes) -> str:
    fmt = _image_mime(image_bytes)
    b64 = base64.b64encode(image_bytes).decode('ascii')
    return f'data:image/{fmt};base64,{b64}'


class DashScopeQwen3VLEncoder:
    """百炼 qwen3-vl-embedding（dashscope.MultiModalEmbedding，批量 + 指数退避重试）。"""

    def __init__(self) -> None:
        from backend.src.core.config import settings

        self._model = settings.RAGF_VISUAL_MODEL
        self._dim = int(settings.RAGF_VISUAL_DIM)
        self._api_key = settings.DASHSCOPE_API_KEY or os.environ.get('DASHSCOPE_API_KEY', '')
        self._batch_size = max(1, min(int(settings.RAGF_VISUAL_BATCH_SIZE), 10))
        self._max_retries = max(1, int(settings.RAGF_VISUAL_MAX_RETRIES))
        self._timeout_s = float(settings.RAGF_VISUAL_TIMEOUT_SECONDS)
        if not self._api_key:
            raise ValueError('RAGF_VISUAL_PROVIDER=dashscope 需要 DASHSCOPE_API_KEY')
        if self._dim not in _DASHSCOPE_DIMS:
            raise ValueError(
                f'RAGF_VISUAL_DIM={self._dim} 不受 qwen3-vl-embedding 支持（可选: {sorted(_DASHSCOPE_DIMS)}）'
            )

    def _call(self, contents: list[dict[str, str]]) -> list[list[float]]:
        import dashscope  # type: ignore[reportMissingImports]  # 可选依赖

        instruct = self._instruct()
        last_err: Exception | None = None
        for attempt in range(self._max_retries):
            try:
                resp = dashscope.MultiModalEmbedding.call(
                    model=self._model,
                    input=contents,
                    api_key=self._api_key,
                    dimension=self._dim,
                    instruct=instruct,
                    timeout=self._timeout_s,
                )
            except Exception as exc:
                last_err = exc
                log.warning(
                    'DashScope MultiModalEmbedding 第 {}/{} 次调用失败: {}', attempt + 1, self._max_retries, exc
                )
                if attempt + 1 < self._max_retries:
                    time.sleep(min(2**attempt, 8))
                continue

            status = getattr(resp, 'status_code', None)
            if status == 200:
                return self._parse_embeddings(resp, expected=len(contents))
            if status in _RETRYABLE_STATUS:
                last_err = RuntimeError(f'DashScope MultiModalEmbedding status={status}: {resp}')
                log.warning('DashScope 第 {}/{} 次调用返回 {}', attempt + 1, self._max_retries, status)
                if attempt + 1 < self._max_retries:
                    time.sleep(min(2**attempt, 8))
                continue
            raise RuntimeError(f'DashScope MultiModalEmbedding 失败 status={status}: {resp}')

        raise RuntimeError(f'DashScope MultiModalEmbedding 重试耗尽: {last_err}') from last_err

    @staticmethod
    def _instruct() -> str:
        from backend.src.core.config import settings

        return settings.RAGF_PIXELRAG_EMBED_INSTRUCTION

    def _parse_embeddings(self, resp: Any, *, expected: int) -> list[list[float]]:
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
                raise RuntimeError(f'DashScope embedding 缺失 index={idx}')
            vec = list(emb)
            if len(vec) != self._dim:
                raise RuntimeError(f'DashScope embedding dim={len(vec)} != 配置 dim={self._dim}')
            by_index[idx] = _l2_normalize(vec)

        missing = [i for i in range(expected) if i not in by_index]
        if missing:
            raise RuntimeError(f'DashScope embedding 响应缺失下标: {missing}')
        return [by_index[i] for i in range(expected)]

    def embed_image(self, image_bytes: bytes) -> list[float]:
        return self._call([{'image': _image_data_uri(image_bytes)}])[0]

    def embed_text(self, text: str) -> list[float]:
        return self._call([{'text': text}])[0]

    def embed_images(self, images: list[bytes]) -> list[list[float]]:
        if not images:
            return []
        out: list[list[float]] = []
        for start in range(0, len(images), self._batch_size):
            chunk = images[start : start + self._batch_size]
            out.extend(self._call([{'image': _image_data_uri(img)} for img in chunk]))
        return out


def get_visual_encoder() -> VisualEncoder:
    """按配置返回视觉编码器（dashscope；local 为 P4 可选，显式报错）。"""
    from backend.src.core.config import settings

    provider = (settings.RAGF_VISUAL_PROVIDER or 'dashscope').strip().lower()
    if provider == 'local':
        raise ValueError('本地视觉编码器为 P4 可选项（spec D7），当前请使用 dashscope provider')
    return DashScopeQwen3VLEncoder()
