"""LibreOffice 转换容器客户端（kb-落地改造清单 Phase 3 / D55 §3B/3E）。

容器是独立的加固服务（`docker/libreoffice/`），**不持有任何 MinIO/DB 凭据**：
输入由本模块以请求体流式送入，输出流式取回，容器只做「字节进 → PDF 出」。

两个约定：
- 文件名经请求头 `X-Filename` 传入（URL/查询串里不放用户可控值）；
- 页数由容器在响应头 `X-Page-Count` 返回，避免后端为读页数再引一个 PDF 解析库。
"""

from __future__ import annotations

import httpx

from backend.src.core.config import settings

__all__ = ['PreviewConversionError', 'convert_office_to_pdf']


class PreviewConversionError(RuntimeError):
    """转换失败（超时 / 容器不可用 / 容器拒绝）。"""


def _sanitize_filename(filename: str) -> str:
    """净化文件名：去路径分隔符、禁前导 `-`（防被容器当命令行参数）。"""
    name = (filename or 'file').replace('/', '_').replace('\\', '_').strip()
    name = name.lstrip('-') or 'file'
    return name[:200]


async def convert_office_to_pdf(*, filename: str, data: bytes) -> tuple[bytes, int]:
    """把 Office 字节交给转换容器，返回 (PDF 字节, 页数)。

    超时与容器 5xx 都抛 `PreviewConversionError`，由任务层落 `failed` 并走降级梯。
    """
    url = f'{settings.RAGF_PREVIEW_CONVERTER_URL.rstrip("/")}/convert'
    headers = {
        'X-Filename': _sanitize_filename(filename),
        'Content-Type': 'application/octet-stream',
    }
    timeout = httpx.Timeout(settings.RAGF_PREVIEW_CONVERT_TIMEOUT_SECONDS, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, content=data, headers=headers)
    except httpx.HTTPError as exc:
        raise PreviewConversionError(f'转换容器不可达: {exc}') from exc
    if response.status_code >= 400:
        detail = response.text[:300] if response.text else ''
        raise PreviewConversionError(f'转换容器返回 {response.status_code}: {detail}')
    page_count = 0
    try:
        page_count = int(response.headers.get('X-Page-Count') or 0)
    except ValueError:
        page_count = 0
    return response.content, page_count
