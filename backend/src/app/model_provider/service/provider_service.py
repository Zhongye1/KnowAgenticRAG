"""模型供应商业务服务（ragf-design D4/D11/D14/D16）。

写路径顺序（§14.8）：先提交 PG、后失效缓存；读路径 cache-aside（缓存未命中回源 DB）。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.app.model_provider.cache import (
    ModelCache,
    ModelInfo,
    build_model_info,
    model_cache,
)
from backend.src.app.model_provider.crud.provider_crud import provider_dao
from backend.src.app.model_provider.model.provider import (
    PROVIDER_ID_PATTERN,
    VALID_MODEL_TYPES,
    VALID_PROVIDER_TYPES,
    ModelProvider,
)
from backend.src.app.model_provider.service.model_factory import get_reranker, select_embedding_model
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from backend.src.app.model_provider.providers.embed import OpenAICompatibleEmbedding
    from backend.src.app.model_provider.providers.rerank import BaseReranker
    from backend.src.app.model_provider.schema.provider import (
        ModelProviderCreateParam,
        ModelProviderUpdateParam,
    )


class ProviderService:
    """模型供应商服务"""

    def __init__(self, cache: ModelCache | None = None) -> None:
        self.cache = cache or model_cache

    # ------------------------------------------------------------------ 校验
    @staticmethod
    def _build_create_data(obj: ModelProviderCreateParam) -> dict[str, Any]:
        data = obj.model_dump()
        provider_id = str(data['provider_id']).strip().lower()
        if not PROVIDER_ID_PATTERN.fullmatch(provider_id):
            raise errors.RequestError(msg='provider_id 只能含小写字母/数字/下划线/中划线，长度 1-100')
        provider_type = data.get('provider_type') or 'openai'
        if provider_type not in VALID_PROVIDER_TYPES:
            raise errors.RequestError(msg=f'provider_type 必须是 {sorted(VALID_PROVIDER_TYPES)} 之一')
        if not str(data.get('base_url') or '').strip():
            if provider_type != 'modelscope':
                raise errors.RequestError(msg='base_url 不能为空（modelscope 可缺省用默认通道）')
            data['base_url'] = settings.MODELSCOPE_API_BASE
        data['base_url'] = str(data['base_url']).strip().rstrip('/')
        data['capabilities'] = _validate_capabilities(data.get('capabilities') or [])
        data['enabled_models'] = _validate_enabled_models(
            data.get('enabled_models') or [],
            set(data['capabilities']) if data['capabilities'] else None,
        )
        data['provider_id'] = provider_id
        return data

    @staticmethod
    def _build_update_data(obj: ModelProviderUpdateParam) -> dict[str, Any]:
        data = obj.model_dump(exclude_unset=True)
        if 'provider_type' in data and data['provider_type'] not in VALID_PROVIDER_TYPES:
            raise errors.RequestError(msg=f'provider_type 必须是 {sorted(VALID_PROVIDER_TYPES)} 之一')
        if 'base_url' in data:
            if not str(data['base_url'] or '').strip():
                raise errors.RequestError(msg='base_url 不能为空')
            data['base_url'] = str(data['base_url']).strip().rstrip('/')
        if 'capabilities' in data:
            data['capabilities'] = _validate_capabilities(data['capabilities'] or [])
        if 'enabled_models' in data:
            data['enabled_models'] = _validate_enabled_models(
                data['enabled_models'] or [],
                set(data.get('capabilities') or []) if data.get('capabilities') else None,
            )
        return data

    # ------------------------------------------------------------------ 写
    async def create(self, db: AsyncSession, obj: ModelProviderCreateParam) -> ModelProvider:
        data = self._build_create_data(obj)
        if await provider_dao.get(db, data['provider_id']):
            raise errors.ConflictError(msg=f'供应商 {data["provider_id"]} 已存在')
        provider = await provider_dao.create(db, data)
        await db.commit()  # 先提交 PG
        await self.cache.invalidate()  # 后失效缓存（§14.8）
        return provider

    async def update(self, db: AsyncSession, provider_id: str, obj: ModelProviderUpdateParam) -> ModelProvider:
        provider = await self.get(db, provider_id)
        if provider is None:
            raise errors.NotFoundError(msg='模型供应商不存在')
        data = self._build_update_data(obj)
        provider = await provider_dao.update(db, provider, data)
        await db.commit()
        await self.cache.invalidate()
        return provider

    async def delete(self, db: AsyncSession, provider_id: str) -> None:
        provider = await self.get(db, provider_id)
        if provider is None:
            raise errors.NotFoundError(msg='模型供应商不存在')
        await provider_dao.delete(db, provider)
        await db.commit()
        await self.cache.invalidate()

    # ------------------------------------------------------------------ 读
    async def get(self, db: AsyncSession, provider_id: str) -> ModelProvider | None:
        return await provider_dao.get(db, provider_id)

    async def get_list(self, db: AsyncSession) -> list[ModelProvider]:
        return await provider_dao.get_list(db)

    # ------------------------------------------------------------------ 运行时解析
    async def get_model_info(self, db: AsyncSession, spec: str) -> ModelInfo | None:
        """缓存优先、DB 回源解析模型 spec（provider_id:model_id）。"""
        spec = normalize_model_spec(spec)
        if not spec:
            return None
        cached = await self.cache.get_model_info(spec)
        if cached is not None:
            return cached
        provider_id, _, model_id = spec.partition(':')
        provider = await provider_dao.get(db, provider_id)
        if provider is None or not provider.is_enabled:
            return None
        for model in provider.enabled_models or []:
            if isinstance(model, dict) and model.get('id') == model_id:
                return build_model_info(provider, model)
        return None

    async def get_embedding_model(self, db: AsyncSession, spec: str) -> OpenAICompatibleEmbedding:
        """按 spec 返回 Embedding 客户端（供 ingest/retrieval 使用）。"""
        info = await self.get_model_info(db, spec)
        if info is None:
            raise errors.NotFoundError(msg=f'未找到模型 spec: {spec}（请检查 model_providers 配置）')
        return select_embedding_model(info)

    async def get_reranker(self, db: AsyncSession, spec: str) -> BaseReranker:
        """按 spec 返回 Reranker 客户端（供 retrieval 使用）。"""
        info = await self.get_model_info(db, spec)
        if info is None:
            raise errors.NotFoundError(msg=f'未找到模型 spec: {spec}（请检查 model_providers 配置）')
        return get_reranker(info)

    async def test_connectivity(self, db: AsyncSession, spec: str) -> dict[str, Any]:
        """连通性测试（embedding/rerank；chat 二期支持）。"""
        info = await self.get_model_info(db, spec)
        if info is None:
            raise errors.NotFoundError(msg=f'未找到模型 spec: {spec}')
        try:
            if info.model_type == 'embedding':
                ok, message = await select_embedding_model(info).test_connection()
                return {'spec': spec, 'status': 'available' if ok else 'unavailable', 'message': message}
            if info.model_type == 'rerank':
                ok, message = await get_reranker(info).test_connection()
                return {'spec': spec, 'status': 'available' if ok else 'unavailable', 'message': message}
        except Exception as exc:
            log.warning(f'测试模型连通性失败 {spec}: {exc}')
            return {'spec': spec, 'status': 'error', 'message': str(exc)}
        return {'spec': spec, 'status': 'error', 'message': 'chat 模型连通性测试属二期'}

    # ------------------------------------------------------------------ 缓存
    async def rebuild_cache(self, db: AsyncSession) -> int:
        providers = await provider_dao.get_list(db)
        return await self.cache.rebuild(providers)

    async def ensure_default_modelscope(self, db: AsyncSession) -> ModelProvider | None:
        """幂等确保默认 modelscope provider（D11/D16：embedding bge-m3 + rerank bge-reranker-v2-m3）。"""
        provider = await provider_dao.get(db, 'modelscope')
        defaults = {
            'provider_id': 'modelscope',
            'display_name': 'ModelScope API',
            'provider_type': 'modelscope',
            'base_url': settings.MODELSCOPE_API_BASE.rstrip('/'),
            'capabilities': ['embedding', 'rerank'],
            'enabled_models': [
                {'id': 'BAAI/bge-m3', 'type': 'embedding', 'dimension': 1024, 'batch_size': 200},
                {
                    'id': 'BAAI/bge-reranker-v2-m3',
                    'type': 'rerank',
                    'extra': {'rerank_protocol': 'openai'},
                },
            ],
            'is_builtin': True,
            'is_enabled': True,
        }
        if provider is None:
            provider = await provider_dao.create(db, defaults)
            await db.commit()
            await self.cache.invalidate()
            log.info('[ModelProvider] 已创建默认 modelscope provider')
            return provider
        missing = [
            model['id']
            for model in defaults['enabled_models']
            if model['id'] not in {item.get('id') for item in (provider.enabled_models or []) if isinstance(item, dict)}
        ]
        if missing:
            provider.enabled_models = list(provider.enabled_models or []) + [
                model for model in defaults['enabled_models'] if model['id'] in missing
            ]
            provider.capabilities = sorted(set(provider.capabilities or []) | {'embedding', 'rerank'})
            await provider_dao.update(db, provider, {})
            await db.commit()
            await self.cache.invalidate()
        return provider


LEGACY_EMBEDDING_ALIASES: dict[str, str] = {
    'bge-m3': 'modelscope:BAAI/bge-m3',
    'BAAI/bge-m3': 'modelscope:BAAI/bge-m3',
}


def normalize_model_spec(spec: str | None) -> str:
    """归一模型 spec（ragf-design §5.6）：legacy 裸 id 兼容默认 provider。"""
    value = (spec or '').strip()
    if not value:
        return ''
    return LEGACY_EMBEDDING_ALIASES.get(value, value)


def _validate_capabilities(capabilities: list[Any]) -> list[str]:
    normalized = [str(item) for item in (capabilities or []) if str(item) in VALID_MODEL_TYPES]
    unknown = [str(item) for item in (capabilities or []) if str(item) not in VALID_MODEL_TYPES]
    if unknown:
        raise errors.RequestError(msg=f'capabilities 只能是 {sorted(VALID_MODEL_TYPES)} 之一，非法: {unknown}')
    return sorted(set(normalized))


def _validate_enabled_models(models: list[Any], capabilities: set[str] | None) -> list[dict[str, Any]]:
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = [_normalize_model_item(item, capabilities, seen) for item in models]
    return normalized


def _normalize_model_item(item: Any, capabilities: set[str] | None, seen: set[str]) -> dict[str, Any]:
    """规范化单个模型项（id/type 校验 + embedding 数值化 + extra 透传）。"""
    if not isinstance(item, dict):
        raise errors.RequestError(msg='enabled_models 每项必须是对象')
    model_id = str(item.get('id') or '').strip()
    model_type = str(item.get('type') or '').strip()
    if not model_id:
        raise errors.RequestError(msg='模型 id 不能为空')
    if model_type not in VALID_MODEL_TYPES:
        raise errors.RequestError(msg=f'模型 {model_id} 的 type 必须是 {sorted(VALID_MODEL_TYPES)} 之一')
    if model_id in seen:
        raise errors.RequestError(msg=f'模型 id 重复: {model_id}')
    if capabilities and model_type not in capabilities:
        raise errors.RequestError(msg=f'模型 {model_id} type={model_type} 不在 provider capabilities 内')
    seen.add(model_id)
    row: dict[str, Any] = {'id': model_id, 'type': model_type, 'display_name': item.get('display_name') or model_id}
    if model_type == 'embedding':
        if item.get('dimension') not in (None, ''):
            row['dimension'] = int(item['dimension'])
        if item.get('batch_size') not in (None, ''):
            row['batch_size'] = int(item['batch_size'])
    if item.get('extra'):
        row['extra'] = item['extra']
    return row


provider_service = ProviderService()
