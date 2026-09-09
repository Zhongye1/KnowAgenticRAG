"""模型客户端工厂（Yuxi models/embed.py + rerank.py + chat.py select_* 移植，ragf-design D11/D16/D17/D18）。"""

from backend.src.app.model_provider.cache import ModelInfo
from backend.src.app.model_provider.providers.chat import OpenAICompatibleChatModel
from backend.src.app.model_provider.providers.embed import HuggingFaceEmbedding, OpenAICompatibleEmbedding
from backend.src.app.model_provider.providers.rerank import (
    BaseReranker,
    DashscopeReranker,
    HuggingFaceReranker,
    OpenAIReranker,
)
from backend.src.common.exception import errors
from backend.src.core.config import settings


def select_embedding_model(info: ModelInfo) -> OpenAICompatibleEmbedding:
    """按 ModelInfo 构建 Embedding 客户端（模型 type 必须是 embedding）。"""
    if info.model_type != 'embedding':
        raise errors.RequestError(msg=f'模型 {info.spec} 不是 embedding 模型（type={info.model_type}）')
    if info.provider_type == 'huggingface':
        return HuggingFaceEmbedding(
            model=info.model_id,
            base_url=info.base_url,
            api_key=info.api_key,
            dimension=info.dimension,
            batch_size=info.batch_size,
            headers=info.headers,
            repo_id=info.extra.get('hf_repo_id'),
        )
    return OpenAICompatibleEmbedding(
        model=info.model_id,
        base_url=info.base_url,
        api_key=info.api_key,
        dimension=info.dimension,
        batch_size=info.batch_size,
        headers=info.headers,
    )


def select_chat_model(info: ModelInfo) -> OpenAICompatibleChatModel:
    """按 ModelInfo 构建 Chat 客户端（D18：模型 type 必须是 chat）。"""
    if info.model_type != 'chat':
        raise errors.RequestError(msg=f'模型 {info.spec} 不是 chat 模型（type={info.model_type}）')
    return OpenAICompatibleChatModel(
        model=info.model_id,
        base_url=info.base_url,
        api_key=info.api_key,
        headers=info.headers,
        timeout=settings.RAGF_CHAT_TIMEOUT_SECONDS,
    )


def get_reranker(info: ModelInfo) -> BaseReranker:
    """按 ModelInfo 构建 Reranker（D16：默认 OpenAI 兼容；rerank_protocol=dashscope 走 DashScope；
    provider_type=huggingface 走 HF Inference text-classification）。"""
    if info.model_type != 'rerank':
        raise errors.RequestError(msg=f'模型 {info.spec} 不是 rerank 模型（type={info.model_type}）')
    if info.provider_type == 'huggingface':
        return HuggingFaceReranker(
            model=info.model_id,
            base_url=info.base_url,
            api_key=info.api_key,
            headers=info.headers,
            repo_id=info.extra.get('hf_repo_id'),
        )
    protocol = str(info.extra.get('rerank_protocol') or info.extra.get('protocol') or 'openai')
    cls = DashscopeReranker if protocol == 'dashscope' else OpenAIReranker
    return cls(model=info.model_id, base_url=info.base_url, api_key=info.api_key, headers=info.headers)
