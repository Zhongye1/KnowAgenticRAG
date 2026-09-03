"""模型客户端工厂（Yuxi models/embed.py + rerank.py select_* 移植，ragf-design D11/D16/D17）。"""

from backend.src.app.model_provider.cache import ModelInfo
from backend.src.app.model_provider.providers.embed import OpenAICompatibleEmbedding
from backend.src.app.model_provider.providers.rerank import BaseReranker, DashscopeReranker, OpenAIReranker
from backend.src.common.exception import errors


def select_embedding_model(info: ModelInfo) -> OpenAICompatibleEmbedding:
    """按 ModelInfo 构建 Embedding 客户端（模型 type 必须是 embedding）。"""
    if info.model_type != 'embedding':
        raise errors.RequestError(msg=f'模型 {info.spec} 不是 embedding 模型（type={info.model_type}）')
    return OpenAICompatibleEmbedding(
        model=info.model_id,
        base_url=info.base_url,
        api_key=info.api_key,
        dimension=info.dimension,
        batch_size=info.batch_size,
        headers=info.headers,
    )


def get_reranker(info: ModelInfo) -> BaseReranker:
    """按 ModelInfo 构建 Reranker（D16：默认 OpenAI 兼容；rerank_protocol=dashscope 走 DashScope）。"""
    if info.model_type != 'rerank':
        raise errors.RequestError(msg=f'模型 {info.spec} 不是 rerank 模型（type={info.model_type}）')
    protocol = str(info.extra.get('rerank_protocol') or info.extra.get('protocol') or 'openai')
    cls = DashscopeReranker if protocol == 'dashscope' else OpenAIReranker
    return cls(model=info.model_id, base_url=info.base_url, api_key=info.api_key, headers=info.headers)
