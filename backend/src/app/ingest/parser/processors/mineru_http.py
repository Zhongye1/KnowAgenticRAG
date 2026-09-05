"""MinerU HTTP API 文档解析器（Yuxi knowledge/parser/mineru.py 移植，ragf-design D8）。

容器化引擎（OCR 默认，D8）：POST ``{RAGF_MINERU_BASE_URL}/file_parse``，返回 ZIP
内含 Markdown；图片上传/表格图像外链等细节保留后续接入（text 主链路先取 md）。
"""

from __future__ import annotations

import asyncio
import tempfile
import zipfile

from pathlib import Path
from typing import Any, ClassVar

import httpx

from backend.src.app.ingest.parser.base import BaseDocumentProcessor, DocumentParseError, ProcessorUnavailableError
from backend.src.app.ingest.parser.registry import register
from backend.src.common.log import log
from backend.src.core.config import settings

MINERU_TIMEOUT_SECONDS = 1800.0
MINERU_PARSE_FORM_FIELDS = {
    'lang_list': ['ch'],
    'backend': 'hybrid-auto-engine',
    'parse_method': 'auto',
    'formula_enable': True,
    'table_enable': True,
    'image_analysis': True,
    'start_page_id': 0,
    'end_page_id': 99999,
    'return_md': True,
    'response_format_zip': True,
    'return_images': True,
}


def _pick_markdown_from_zip(zip_path: str) -> str:
    """从 MinerU 返回的 ZIP 中提取 Markdown 文本（取内容最多的 .md）。"""
    with zipfile.ZipFile(zip_path) as archive:
        candidates = [
            (name, archive.read(name).decode('utf-8', errors='replace'))
            for name in archive.namelist()
            if name.lower().endswith('.md')
        ]
    if not candidates:
        raise DocumentParseError(
            'MinerU 响应 ZIP 中未找到 Markdown', service_name='mineru_http', error_code='no_markdown'
        )
    return max(candidates, key=lambda item: len(item[1]))[1]


@register
class MinerUHttpProcessor(BaseDocumentProcessor):
    """MinerU HTTP API 文档解析器（OCR 默认引擎，D8）。"""

    service_name: ClassVar[str] = 'mineru'
    display_name: ClassVar[str] = 'MinerU HTTP API'
    supported_extensions: ClassVar[list[str]] = ['.pdf', '.png', '.jpg', '.jpeg']

    def __init__(self, server_url: str | None = None) -> None:
        self.server_url = (server_url or settings.RAGF_MINERU_BASE_URL or 'http://localhost:8080').rstrip('/')
        self.parse_endpoint = f'{self.server_url}/file_parse'

    async def parse_bytes(self, data: bytes, filename: str, params: dict[str, Any] | None = None) -> str:
        if not data:
            raise DocumentParseError('文件内容为空', service_name=self.service_name, error_code='empty_content')
        fields = dict(MINERU_PARSE_FORM_FIELDS)
        fields.update({key: value for key, value in (params or {}).items() if key in MINERU_PARSE_FORM_FIELDS})
        timeout = float((params or {}).get('timeout_seconds') or MINERU_TIMEOUT_SECONDS)

        def _post() -> httpx.Response:
            with httpx.Client(timeout=timeout) as client:
                return client.post(
                    self.parse_endpoint,
                    files={'files': (Path(filename).name, data, 'application/octet-stream')},
                    data=fields,
                )

        try:
            response = await asyncio.to_thread(_post)
        except httpx.ConnectError as exc:
            raise ProcessorUnavailableError(
                f'MinerU 服务连接失败: {self.server_url}（请确认 OCR 容器已启动）',
                service_name=self.service_name,
                error_code='connection_error',
            ) from exc
        except httpx.TimeoutException as exc:
            raise DocumentParseError('MinerU 处理超时', service_name=self.service_name, error_code='timeout') from exc

        if response.status_code != 200:
            raise DocumentParseError(
                f'MinerU HTTP {response.status_code}: {response.text[:500]}',
                service_name=self.service_name,
                error_code=f'http_{response.status_code}',
            )

        with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
            tmp.write(response.content)
            tmp_path = tmp.name
        try:
            text = _pick_markdown_from_zip(tmp_path).strip()
        finally:
            await asyncio.to_thread(Path(tmp_path).unlink, missing_ok=True)

        if not text:
            raise DocumentParseError(
                'MinerU 未返回任何文本内容', service_name=self.service_name, error_code='no_content'
            )
        log.info('MinerU 解析成功 file={} chars={}', Path(filename).name, len(text))
        return text

    async def check_health(self) -> dict[str, Any]:
        try:
            response = await asyncio.to_thread(httpx.get, f'{self.server_url}/openapi.json', timeout=5)
        except Exception as exc:
            return {
                'status': 'unavailable',
                'message': f'MinerU 服务无法连接: {exc}',
                'details': {'server_url': self.server_url},
            }
        if response.status_code == 200:
            return {
                'status': 'healthy',
                'message': 'MinerU 服务运行正常',
                'details': {'server_url': self.server_url},
            }
        return {'status': 'unhealthy', 'message': f'MinerU 响应异常: {response.status_code}', 'details': {}}
