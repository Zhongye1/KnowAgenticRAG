"""文档处理器基础接口与异常（Yuxi knowledge/parser/base.py 移植，ragf-design D8）。

处理器输出统一 Markdown 字符串（含 engine 溯源）；解析失败抛
``DocumentParseError``，由摄取服务映射为 parsing_failed 状态 + error_message。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar


class DocumentParseError(Exception):
    """文档解析异常基类（service_name/error_code 供状态机落 error_message）。"""

    def __init__(self, message: str, *, service_name: str = '', error_code: str = '') -> None:
        super().__init__(message)
        self.message = message
        self.service_name = service_name
        self.error_code = error_code


class ProcessorUnavailableError(DocumentParseError):
    """处理器不可用（依赖未安装/服务未配置/引擎未移植）。"""


@dataclass(slots=True)
class MarkdownParseResult:
    """统一的 Markdown 解析结果。"""

    markdown: str
    engine: str
    artifacts: dict[str, Any] = field(default_factory=dict)


class BaseDocumentProcessor(ABC):
    """文档处理器基类：输入文件字节流，输出 Markdown 字符串。"""

    service_name: ClassVar[str] = ''
    display_name: ClassVar[str] = ''
    supported_extensions: ClassVar[list[str]] = []

    @abstractmethod
    async def parse_bytes(self, data: bytes, filename: str, params: dict[str, Any] | None = None) -> str:
        """解析文件字节流并返回 Markdown 文本。"""

    @abstractmethod
    async def check_health(self) -> dict[str, Any]:
        """返回健康状态（healthy/unhealthy/unavailable/error + message/details）。"""

    @classmethod
    def get_supported_extensions(cls) -> list[str]:
        return list(cls.supported_extensions)

    @classmethod
    def supports_file_type(cls, file_extension: str) -> bool:
        return file_extension.lower() in cls.get_supported_extensions()
