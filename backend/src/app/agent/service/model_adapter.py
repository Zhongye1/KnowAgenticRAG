"""ModelInfo → LangChain ``ChatOpenAI`` 适配（agentic-rag spec D34）。

agent 图的内层 ``create_agent``、结构化输出（plan/rewrite）与流式生成都要求
LangChain ``BaseChatModel``，而 ``model_provider`` 门面返回的是自研
``OpenAICompatibleChatModel``。本模块是两者之间唯一的适配层，且刻意放在 agent 域内：
基础域 ``model_provider`` 因此不必反向依赖 LangChain（D34 依赖方向）。

两个协议差异在此抹平：

1. **URL**：自研客户端接受 ``.../chat/completions`` 结尾的 base_url，LangChain 需要
   API 根（自行拼接），故剥离该后缀；
2. **思考等级**：chat 域语义 ``thinking_level``（low/medium/high/off）不是 OpenAI
   字段，翻译为 ``reasoning_effort`` 或 Qwen 系 ``chat_template_kwargs.enable_thinking``。

节点只会收到 ``BaseChatModel``，对上述差异无感知。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from backend.src.common.exception import errors

if TYPE_CHECKING:
    from langchain_core.language_models import LanguageModelInput

    from backend.src.app.model_provider.cache import ModelInfo

__all__ = ['AgentChatModel', 'build_agent_chat_model']

_COMPLETIONS_SUFFIX = '/chat/completions'
_THINKING_EFFORT_LEVELS = frozenset({'low', 'medium', 'high'})
# 自建 OpenAI 兼容服务（vLLM/ollama）通常不校验 key，但 ChatOpenAI 构造期强制要求非空
_PLACEHOLDER_API_KEY = 'not-required'


class AgentChatModel(ChatOpenAI):
    """``ChatOpenAI`` 子类：把 ``thinking_level`` 翻译为 OpenAI 兼容请求字段。

    ``generate`` 节点与 chat 域共用同一份 ``thinking_level`` 语义，会在 ``astream``
    里原样透传该 kwarg；``ChatOpenAI`` 的载荷构造是 ``{**default_params, **kwargs}``，
    未知 kwarg 会直接进请求体被上游拒绝，故必须在此拦截。
    """

    def _get_request_payload(
        self,
        input_: LanguageModelInput,
        *,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> dict:
        """构造请求体：消化 ``thinking_level``、统一 token 上限字段名。

        父类把 ``max_tokens`` 改名为 ``max_completion_tokens``；本仓库的 chat 通道
        （``OpenAICompatibleChatModel``）与既有 provider 配置都发 ``max_tokens``，
        部分 OpenAI 兼容服务未跟进新名，故在此改回，保证两条链路对同一模型行发出
        相同请求体。
        """
        thinking_level = kwargs.pop('thinking_level', None)
        payload = super()._get_request_payload(input_, stop=stop, **kwargs)
        if 'max_completion_tokens' in payload:
            payload['max_tokens'] = payload.pop('max_completion_tokens')
        if thinking_level in _THINKING_EFFORT_LEVELS:
            payload['reasoning_effort'] = thinking_level
        elif thinking_level == 'off':
            payload['chat_template_kwargs'] = {'enable_thinking': False}
        return payload


def _api_root(base_url: str) -> str:
    """剥离 ``/chat/completions`` 后缀：LangChain 自行拼接该路径。"""
    url = (base_url or '').strip().rstrip('/')
    if url.endswith(_COMPLETIONS_SUFFIX):
        return url[: -len(_COMPLETIONS_SUFFIX)]
    return url


def build_agent_chat_model(
    info: ModelInfo,
    *,
    temperature: float | None = None,
    max_tokens: int | None = None,
    timeout: float = 120.0,
) -> AgentChatModel:
    """由 provider 模型行构建 LangChain chat 模型（type 必须是 chat，fail-closed）。"""
    if info.model_type != 'chat':
        raise errors.RequestError(msg=f'模型 {info.spec} 不是 chat 模型（type={info.model_type}）')
    if not _api_root(info.base_url):
        raise errors.RequestError(msg=f'模型 {info.spec} 未配置 base_url，无法作为 Agent 模型使用')
    return AgentChatModel(
        model=info.model_id,
        api_key=SecretStr(info.api_key or _PLACEHOLDER_API_KEY),
        base_url=_api_root(info.base_url),
        default_headers=dict(info.headers or {}) or None,
        temperature=temperature,
        max_completion_tokens=max_tokens,
        timeout=timeout,
        max_retries=0,  # 重试策略交给图节点（D36 墙钟预算内可控）
    )
