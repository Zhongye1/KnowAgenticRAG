"""模型供应商 Redis 缓存（Yuxi ModelCache 移植，ragf-design D4/D14.8）。

跨进程（API / Celery worker）一致读取 provider 配置：写入只发生在本模块，
provider 增改删走“先提交 PG、后失效缓存”（service 层保证顺序）。
模型 spec 格式：``provider_id:model_id``（model_id 允许含斜杠，不允许含冒号）。
"""

from __future__ import annotations

import json

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.redis import redis_client

if TYPE_CHECKING:
    from backend.src.app.model_provider.model.provider import ModelProvider

MODEL_CACHE_KEY = f'{settings.MODEL_PROVIDER_CACHE_REDIS_PREFIX}:models'


@dataclass(frozen=True)
class ModelInfo:
    """不可变模型信息，供运行时选择模型客户端。"""

    provider_id: str
    model_id: str
    model_type: str  # chat / embedding / rerank
    display_name: str
    api_key: str
    base_url: str
    provider_type: str  # openai / modelscope / dashscope
    headers: dict[str, str] = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)
    dimension: int | None = None
    batch_size: int = 200  # D17：embedding 默认批大小；模型行可覆盖

    @property
    def spec(self) -> str:
        return f'{self.provider_id}:{self.model_id}'

    def to_dict(self) -> dict[str, Any]:
        return {
            'provider_id': self.provider_id,
            'model_id': self.model_id,
            'model_type': self.model_type,
            'display_name': self.display_name,
            'api_key': self.api_key,
            'base_url': self.base_url,
            'provider_type': self.provider_type,
            'headers': self.headers,
            'extra': self.extra,
            'dimension': self.dimension,
            'batch_size': self.batch_size,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ModelInfo:
        return cls(
            provider_id=data['provider_id'],
            model_id=data['model_id'],
            model_type=data['model_type'],
            display_name=data['display_name'],
            api_key=data.get('api_key') or '',
            base_url=data.get('base_url') or '',
            provider_type=data.get('provider_type') or 'openai',
            headers=data.get('headers') or {},
            extra=data.get('extra') or {},
            dimension=data.get('dimension'),
            batch_size=int(data.get('batch_size') or 200),
        )


def resolve_provider_api_key(provider: ModelProvider) -> str | None:
    """解析 provider 的 API Key：直接配置 > api_key_env 环境变量 > modelscope 默认环境变量。"""
    if provider.api_key:
        return provider.api_key
    if provider.api_key_env:
        import os

        return os.getenv(provider.api_key_env)
    if provider.provider_type == 'modelscope':
        return settings.MODELSCOPE_ACCESS_TOKEN
    return None


def _base_url_for_type(provider: ModelProvider, model_type: str) -> str:
    if model_type == 'embedding' and provider.embedding_base_url:
        return provider.embedding_base_url
    if model_type == 'rerank' and provider.rerank_base_url:
        return provider.rerank_base_url
    return provider.base_url


def build_model_info(provider: ModelProvider, model: dict[str, Any]) -> ModelInfo | None:
    """由 provider 行 + 模型项构建 ModelInfo（跳过非法/未启用项）。"""
    model_id = str(model.get('id') or '').strip()
    model_type = str(model.get('type') or '').strip()
    if not model_id or model_type not in {'chat', 'embedding', 'rerank'}:
        return None
    model_extra = dict(model.get('extra') or {})
    provider_extra = dict(provider.extra_json or {})
    merged_extra = {**provider_extra, **model_extra}
    batch_size = model.get('batch_size')
    return ModelInfo(
        provider_id=provider.provider_id,
        model_id=model_id,
        model_type=model_type,
        display_name=str(model.get('display_name') or model_id),
        api_key=resolve_provider_api_key(provider) or '',
        base_url=_base_url_for_type(provider, model_type) or '',
        provider_type=provider.provider_type,
        headers=dict(provider.headers_json or {}),
        extra=merged_extra,
        dimension=model.get('dimension'),
        batch_size=int(batch_size) if batch_size else 200,
    )


class ModelCache:
    """基于 Redis 的模型信息缓存。"""

    async def _get_raw(self) -> dict[str, ModelInfo]:
        try:
            raw = await redis_client.get(MODEL_CACHE_KEY)
            if not raw:
                return {}
            items = json.loads(raw)
            return {spec: ModelInfo.from_dict(data) for spec, data in items.items()}
        except Exception as exc:
            log.warning(f'[ModelCache] 读取失败: {exc}')
            return {}

    async def get_model_info(self, spec: str) -> ModelInfo | None:
        return (await self._get_raw()).get(spec)

    async def get_all(self, model_type: str | None = None) -> list[ModelInfo]:
        infos = list((await self._get_raw()).values())
        if model_type is None:
            return infos
        return [info for info in infos if info.model_type == model_type]

    async def rebuild(self, providers: list[ModelProvider]) -> int:
        """以 DB 全量重建缓存（仅启用 provider 的已启用模型）。"""
        cache: dict[str, ModelInfo] = {}
        for provider in providers:
            if not provider.is_enabled:
                continue
            for model in provider.enabled_models or []:
                if not isinstance(model, dict):
                    continue
                info = build_model_info(provider, model)
                if info is not None:
                    cache[info.spec] = info
        try:
            await redis_client.set(
                MODEL_CACHE_KEY,
                json.dumps({spec: info.to_dict() for spec, info in cache.items()}, ensure_ascii=False),
                ex=settings.MODEL_PROVIDER_CACHE_TTL,
            )
        except Exception as exc:
            log.warning(f'[ModelCache] 写入失败: {exc}')
        log.info(f'[ModelCache] 重建完成: {len(cache)} 个模型')
        return len(cache)

    async def invalidate(self) -> None:
        try:
            await redis_client.delete(MODEL_CACHE_KEY)
        except Exception as exc:
            log.warning(f'[ModelCache] 失效失败: {exc}')


model_cache = ModelCache()
