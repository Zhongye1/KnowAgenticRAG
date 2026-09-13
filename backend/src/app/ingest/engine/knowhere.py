"""Knowhere 文档语义解析引擎（双管线摄取 spec D1，EagleRAG knowhere_adapter 迁移）。

单一路径（api 模式）：``knowhere-python-sdk``（主依赖）调自建 HTTP 服务
（:5005），上传后轮询；parser 进程内模式已删除。

失败 fail-closed：调用失败抛 ``KnowhereEngineError``，任务层落失败态，
绝不静默降级。SDK 产物按 duck-typing 读取（不导入 SDK 类型），
解析结果约定：``chunks``（text/table/image，含 path/metadata）、
``doc_nav.sections``（章节树）、``full_markdown``。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import knowhere

from backend.src.common.log import log

__all__ = ['KnowhereEngineError', 'parse_with_knowhere']


class KnowhereEngineError(Exception):
    """Knowhere 引擎调用失败（fail-closed）。"""


def _parsing_params() -> dict[str, Any]:
    """由 settings 组装 parsing_params（LLM/VLM 摘要按量计费，缺省关闭）。"""
    from backend.src.core.config import settings

    return {
        'summary_image': bool(settings.RAGF_KNOWHERE_SUMMARY_IMAGE),
        'summary_table': bool(settings.RAGF_KNOWHERE_SUMMARY_TABLE),
        'smart_title_parse': bool(settings.RAGF_KNOWHERE_SMART_TITLE_PARSE),
    }


def _parse_via_api(file_path: str, *, file_name: str) -> Any:
    """经 knowhere-python-sdk 调自建 :5005 服务并轮询至完成。"""
    from backend.src.core.config import settings

    kh = settings
    client_cls = getattr(knowhere, 'Knowhere', None)
    if client_cls is None:
        raise KnowhereEngineError('knowhere-python-sdk 安装不完整（缺少 Knowhere 客户端类）')
    client = client_cls(
        api_key=kh.RAGF_KNOWHERE_API_KEY or None,
        base_url=kh.RAGF_KNOWHERE_BASE_URL.rstrip('/'),
        timeout=kh.RAGF_KNOWHERE_TIMEOUT,
        upload_timeout=kh.RAGF_KNOWHERE_UPLOAD_TIMEOUT,
        max_retries=kh.RAGF_KNOWHERE_MAX_RETRIES,
    )
    try:
        return client.parse(
            file=Path(file_path),
            file_name=file_name,
            parsing_params=_parsing_params() or None,
            poll_interval=kh.RAGF_KNOWHERE_POLL_INTERVAL,
            poll_timeout=kh.RAGF_KNOWHERE_POLL_TIMEOUT,
        )
    except Exception as exc:
        raise KnowhereEngineError(f'Knowhere API 调用失败 (file={file_name}): {exc}') from exc


def parse_with_knowhere(file_path: str, *, file_name: str) -> Any:
    """经 Knowhere api 模式解析文档，返回 SDK ParseResult（duck-typing）。

    阻塞调用（含上传与轮询），任务层须以 ``asyncio.to_thread`` 执行。
    """
    from backend.src.core.config import settings

    log.info('Knowhere api 模式解析开始 file={} base_url={}', file_name, settings.RAGF_KNOWHERE_BASE_URL)
    return _parse_via_api(file_path, file_name=file_name)
