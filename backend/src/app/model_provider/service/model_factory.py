"""模型客户端工厂（Yuxi models/embed.py + rerank.py + chat.py select_* 移植，ragf-design D11/D16/D17/D18）。"""

from backend.src.app.model_provider.cache import ModelInfo
from backend.src.app.model_provider.providers.chat import OpenAICompatibleChatModel
from backend.src.app.model_provider.providers.dashscope_clients import DashScopeEmbedding, DashScopeTextReRank
from backend.src.app.model_provider.providers.embed import OpenAICompatibleEmbedding
from backend.src.common.exception import errors
from backend.src.core.config import settings


def select_embedding_model(info: ModelInfo) -> OpenAICompatibleEmbedding | DashScopeEmbedding:
    """按 ModelInfo 构建 Embedding 客户端（模型 type 必须是 embedding）。"""
    if info.model_type != 'embedding':
        raise errors.RequestError(msg=f'模型 {info.spec} 不是 embedding 模型（type={info.model_type}）')
    if info.provider_type == 'dashscope':
        # 千问平台 token 通道（SDK 调用，ragf-design D11 扩展）
        return DashScopeEmbedding(
            model=info.model_id,
            api_key=info.api_key,
            dimension=info.dimension,
            batch_size=info.batch_size,
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


def get_reranker(info: ModelInfo) -> DashScopeTextReRank:
    """按 ModelInfo 构建 Reranker（D16 演进：重排仅千问 SDK 通道 qwen3.7-text-rerank）。

    模型行 extra 需声明 ``rerank_protocol='dashscope-sdk'``；其余协议已下线。
    """
    if info.model_type != 'rerank':
        raise errors.RequestError(msg=f'模型 {info.spec} 不是 rerank 模型（type={info.model_type}）')
    protocol = str(info.extra.get('rerank_protocol') or info.extra.get('protocol') or '')
    if protocol != 'dashscope-sdk':
        raise errors.RequestError(
            msg=f'重排仅支持千问 SDK 通道：模型 {info.spec} '
            f'需 extra.rerank_protocol=dashscope-sdk（当前 {protocol or "未声明"}）'
        )
    return DashScopeTextReRank(model=info.model_id, api_key=info.api_key)
