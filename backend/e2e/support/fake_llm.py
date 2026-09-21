"""外部 LLM 网关替身（本套件唯一允许的替身，见 spec §3.4）。

chat 链路的最后一段是**第三方服务**（OpenAI 兼容端点）：不可控、不确定、要密钥。
这里只替换 ``chat_service._chat_gateway``（外部边界），ACL / 检索 / 引用装配 / SSE
事件协议全部真实。替身同时录下模型收到的 messages —— 「引用正文真的进了提示词」
才是本项目的契约，模型回什么不是。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

from backend.src.app.model_provider.providers.chat import ChatStreamEvent

if TYPE_CHECKING:
    import pytest

    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['DEFAULT_ANSWER', 'FAKE_USAGE', 'FakeChatGateway', 'FakeChatModel', 'install_fake_chat']

DEFAULT_ANSWER = '根据 [1]：先装 PostgreSQL，再装 Redis。'
FAKE_USAGE: dict[str, int] = {'prompt_tokens': 11, 'completion_tokens': 7, 'total_tokens': 18}
_CHUNK_SIZE = 6


def _chunks(text: str) -> list[str]:
    """切帧（≥2 帧，覆盖 delta 多帧路径）。"""
    pieces = [text[i : i + _CHUNK_SIZE] for i in range(0, len(text), _CHUNK_SIZE)]
    return pieces or ['']


class FakeChatModel:
    """确定性 chat 模型：回固定文案，并记录每次收到的 messages。"""

    def __init__(self, answer: str = DEFAULT_ANSWER) -> None:
        self.answer = answer
        self.calls: list[list[dict[str, Any]]] = []

    @property
    def prompt_text(self) -> str:
        """最近一次调用的提示词全文（system + history + user）。"""
        return '\n'.join(str(message.get('content') or '') for message in self.messages)

    @property
    def messages(self) -> list[dict[str, Any]]:
        return self.calls[-1] if self.calls else []

    async def achat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        thinking_level: str | None = None,
    ) -> AsyncIterator[ChatStreamEvent]:
        self.calls.append([dict(message) for message in messages])
        for piece in _chunks(self.answer):
            yield ChatStreamEvent(content=piece)
        yield ChatStreamEvent(finish_reason='stop')
        yield ChatStreamEvent(usage=dict(FAKE_USAGE))

    async def achat(
        self,
        messages: list[dict[str, Any]],
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        thinking_level: str | None = None,
    ) -> tuple[str, dict[str, int]]:
        self.calls.append([dict(message) for message in messages])
        return self.answer, dict(FAKE_USAGE)


class FakeChatGateway:
    """``ChatService._chat_gateway`` 替身：只看 spec 是否被正确解析。"""

    def __init__(self, model: FakeChatModel | None = None) -> None:
        self.model = model or FakeChatModel()
        self.specs: list[str] = []

    async def get(self, db: AsyncSession, spec: str) -> FakeChatModel:
        self.specs.append(spec)
        return self.model


def install_fake_chat(monkeypatch: pytest.MonkeyPatch, *, answer: str = DEFAULT_ANSWER) -> FakeChatModel:
    """把 chat 门面的模型网关换成替身，返回替身以便断言提示词。"""
    from backend.src.app.chat.service.chat_service import chat_service

    model = FakeChatModel(answer)
    monkeypatch.setattr(chat_service, '_chat_gateway', FakeChatGateway(model))
    return model
