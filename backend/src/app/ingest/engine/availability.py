"""引擎可用性探测（双管线摄取 spec D1/D3）。

路由期调用：不可用引擎路由期即 fail-closed 报错（legacy 兜底已删除）。只做轻量探测
（settings / importlib.util.find_spec），不触发 torch 等重依赖的真实导入。
"""

from __future__ import annotations

import importlib.util
import os

__all__ = ['knowhere_available', 'visual_available']


def _module_installed(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def knowhere_available() -> tuple[bool, str]:
    """Knowhere 引擎是否可用，返回 (可用, 不可用原因)。"""
    from backend.src.core.config import settings

    mode = (settings.RAGF_KNOWHERE_MODE or 'off').lower()
    if mode == 'off':
        return False, 'RAGF_KNOWHERE_MODE=off'
    if mode == 'api':
        if not settings.RAGF_KNOWHERE_BASE_URL:
            return False, 'RAGF_KNOWHERE_BASE_URL 未配置'
        return True, ''
    # parser 模式：进程内 SDK
    if not _module_installed('knowhere_parse'):
        return False, 'knowhere-parse-sdk 未安装'
    return True, ''


def visual_available() -> tuple[bool, str]:
    """PixelRAG 视觉管线是否可用，返回 (可用, 不可用原因)。"""
    from backend.src.core.config import settings

    provider = (settings.RAGF_VISUAL_PROVIDER or 'dashscope').lower()
    if provider == 'dashscope':
        if settings.DASHSCOPE_API_KEY or os.environ.get('DASHSCOPE_API_KEY'):
            return True, ''
        if not _module_installed('pixelrag_render'):
            return False, 'DASHSCOPE_API_KEY 未配置且 pixelrag 未安装'
        return False, 'DASHSCOPE_API_KEY 未配置'
    # local provider：本地 HF Qwen3-VL 权重
    if not _module_installed('torch') or not _module_installed('transformers'):
        return False, 'local provider 需要 torch/transformers（未安装）'
    return True, ''
