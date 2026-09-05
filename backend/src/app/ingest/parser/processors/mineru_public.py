"""MinerU 精准解析 API 文档解析器（公网 mineru.net v4，D8 定稿：不自建 OCR 容器）。

异步任务 + 轮询（不接 callback，任务内等待完成）：
1. ``POST {base}/api/v4/file-urls/batch`` 申请预签名上传地址（单文件也走批量口）；
2. ``PUT`` bytes 到 upload_url（预签名，按官方示例不带 Content-Type）；
3. ``GET {base}/api/v4/extract-results/batch/{batch_id}`` 轮询 state=done/failed；
4. 下载 full_zip_url，取其中 Markdown 返回。

Token 在 mineru.net “API 管理页面”创建，经 env ``MINERU_API_TOKEN`` 配置；
缺失/无效按 ProcessorUnavailableError 抛给工厂降级链（RapidOCR 兜底）。
参数覆盖走 processing 白名单（``mineru_model_version`` 等，KB ingest_params 后续接）。
"""

from __future__ import annotations

import asyncio
import io
import zipfile

from pathlib import Path
from typing import Any, ClassVar

import httpx

from backend.src.app.ingest.parser.base import BaseDocumentProcessor, DocumentParseError, ProcessorUnavailableError
from backend.src.app.ingest.parser.registry import register
from backend.src.common.log import log
from backend.src.core.config import settings

MINERU_FILE_URLS_PATH = '/api/v4/file-urls/batch'
MINERU_EXTRACT_RESULTS_PATH = '/api/v4/extract-results/batch'
MINERU_MODEL_VERSIONS = frozenset({'pipeline', 'vlm', 'MinerU-HTML'})
MINERU_DONE_STATES = frozenset({'done', 'failed'})
MINERU_PENDING_STATES = frozenset({'waiting-file', 'pending', 'running', 'converting'})
# 单次请求超时（上传/申请/轮询单次）；总等待上限见 settings.RAGF_MINERU_TIMEOUT_SECONDS
MINERU_REQUEST_TIMEOUT_SECONDS = 60.0


def _pick_markdown_from_zip_bytes(content: bytes) -> str:
    """从 MinerU 结果 ZIP（bytes）中提取 Markdown（取内容最多的 .md）。"""
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        candidates = [
            (name, archive.read(name).decode('utf-8', errors='replace'))
            for name in archive.namelist()
            if name.lower().endswith('.md')
        ]
    if not candidates:
        raise DocumentParseError('MinerU 结果 ZIP 中未找到 Markdown', service_name='mineru', error_code='no_markdown')
    return max(candidates, key=lambda item: len(item[1]))[1]


def _raise_for_api(response: httpx.Response, payload: dict[str, Any]) -> None:
    """MinerU 业务错误统一抛 DocumentParseError（code/msg/trace 结构化保留）。"""
    code = payload.get('code')
    if code == 0:
        return
    msg = str(payload.get('msg') or payload.get('message') or 'MinerU API 错误')
    raise DocumentParseError(
        f'MinerU API {code}: {msg}',
        service_name='mineru',
        error_code=f'mineru_api_{code}',
    )


def _api_error(response: httpx.Response) -> DocumentParseError:
    return DocumentParseError(
        f'MinerU HTTP {response.status_code}: {response.text[:500]}',
        service_name='mineru',
        error_code=f'http_{response.status_code}',
    )


@register
class MinerUPublicProcessor(BaseDocumentProcessor):
    """MinerU 精准解析 API（公网 OCR 默认引擎，D8）。"""

    service_name: ClassVar[str] = 'mineru'
    display_name: ClassVar[str] = 'MinerU 精准解析 API'
    supported_extensions: ClassVar[list[str]] = ['.pdf', '.png', '.jpg', '.jpeg']

    def __init__(self, api_base: str | None = None, transport: httpx.BaseTransport | None = None) -> None:
        self.api_base = (api_base or settings.RAGF_MINERU_API_BASE or 'https://mineru.net').rstrip('/')
        self._transport = transport  # 测试注入（生产 None → 默认网络传输）

    # ------------------------------------------------------------------ 参数
    def _request_params(self, params: dict[str, Any] | None) -> dict[str, Any]:
        source = dict(params or {})
        model_version = str(source.get('mineru_model_version') or settings.RAGF_MINERU_MODEL_VERSION or 'vlm')
        if model_version not in MINERU_MODEL_VERSIONS:
            raise DocumentParseError(
                f'MinerU model_version 非法: {model_version}（可选 {sorted(MINERU_MODEL_VERSIONS)}）',
                service_name=self.service_name,
                error_code='bad_model_version',
            )
        return {
            'model_version': model_version,
            'is_ocr': bool(source.get('mineru_is_ocr', settings.RAGF_MINERU_IS_OCR)),
            'enable_formula': bool(source.get('mineru_enable_formula', settings.RAGF_MINERU_ENABLE_FORMULA)),
            'enable_table': bool(source.get('mineru_enable_table', settings.RAGF_MINERU_ENABLE_TABLE)),
            'language': str(source.get('mineru_language') or settings.RAGF_MINERU_LANGUAGE or 'ch'),
            'page_ranges': str(source['mineru_page_ranges']) if source.get('mineru_page_ranges') else None,
            'data_id': str(source['document_id']) if source.get('document_id') else None,
        }

    def _auth_headers(self) -> dict[str, str]:
        token = settings.MINERU_API_TOKEN
        if not token:
            raise ProcessorUnavailableError(
                '未配置 MinerU API Token（env MINERU_API_TOKEN，mineru.net API 管理页面创建）；'
                '已由兜底引擎接管或请配置后重试',
                service_name=self.service_name,
                error_code='token_unset',
            )
        return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    # ------------------------------------------------------------------ 主流程
    async def parse_bytes(self, data: bytes, filename: str, params: dict[str, Any] | None = None) -> str:
        if not data:
            raise DocumentParseError('文件内容为空', service_name=self.service_name, error_code='empty_content')
        if len(data) > 200 * 1024 * 1024:
            raise DocumentParseError(
                'MinerU 公网 API 单文件上限 200MB',
                service_name=self.service_name,
                error_code='file_too_large',
            )
        file_name = Path(filename).name or 'document'
        request_params = self._request_params(params)
        timeout = float((params or {}).get('timeout_seconds') or settings.RAGF_MINERU_TIMEOUT_SECONDS or 900.0)
        poll_interval = float(settings.RAGF_MINERU_POLL_INTERVAL_SECONDS or 3.0)
        headers = self._auth_headers()
        transport_kwargs = {'transport': self._transport} if self._transport is not None else {}

        async with httpx.AsyncClient(timeout=MINERU_REQUEST_TIMEOUT_SECONDS, **transport_kwargs) as client:
            # ① 申请上传地址（单文件也走批量口，上传后自动触发解析）
            batch_id, upload_url = await self._apply_upload_urls(client, headers, file_name, request_params)
            # ② 上传（预签名，按官方示例不带 Content-Type）
            await self._upload_file(client, upload_url, data, file_name)
            # ③ 轮询解析结果
            try:
                result = await self._poll_result(client, headers, batch_id, file_name, timeout, poll_interval)
            except asyncio.CancelledError:
                raise
            except httpx.TimeoutException as exc:
                raise DocumentParseError(
                    'MinerU 轮询超时', service_name=self.service_name, error_code='poll_timeout'
                ) from exc

        # ④ 下载结果 ZIP → Markdown
        full_zip_url = str(result.get('full_zip_url') or '')
        if not full_zip_url:
            raise DocumentParseError(
                'MinerU 结果缺少 full_zip_url',
                service_name=self.service_name,
                error_code='bad_response',
            )
        text = await self._download_markdown(full_zip_url, transport_kwargs, file_name)
        log.info('MinerU 解析成功 file={} chars={}', file_name, len(text))
        return text

    async def _apply_upload_urls(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        file_name: str,
        request_params: dict[str, Any],
    ) -> tuple[str, str]:
        try:
            response = await client.post(
                f'{self.api_base}{MINERU_FILE_URLS_PATH}',
                headers=headers,
                json={'files': [self._file_item(file_name, request_params)], **self._batch_options(request_params)},
            )
        except httpx.ConnectError as exc:
            raise ProcessorUnavailableError(
                f'MinerU 公网 API 连接失败: {self.api_base}（{exc}）',
                service_name=self.service_name,
                error_code='connection_error',
            ) from exc
        except httpx.TimeoutException as exc:
            raise DocumentParseError(
                'MinerU 申请上传地址超时', service_name=self.service_name, error_code='timeout'
            ) from exc
        if response.status_code != 200:
            raise _api_error(response)
        body = response.json()
        _raise_for_api(response, body)
        data = body.get('data') or {}
        batch_id = str(data.get('batch_id') or '')
        upload_urls = data.get('file_urls') or []
        if not batch_id or not upload_urls:
            raise DocumentParseError(
                'MinerU 响应缺少 batch_id/file_urls',
                service_name=self.service_name,
                error_code='bad_response',
            )
        return batch_id, str(upload_urls[0])

    async def _upload_file(self, client: httpx.AsyncClient, upload_url: str, data: bytes, file_name: str) -> None:
        try:
            response = await client.put(upload_url, content=data)
        except httpx.TimeoutException as exc:
            raise DocumentParseError(
                'MinerU 文件上传超时', service_name=self.service_name, error_code='upload_timeout'
            ) from exc
        if response.status_code != 200:
            raise DocumentParseError(
                f'MinerU 文件上传失败 HTTP {response.status_code}: {response.text[:300]}',
                service_name=self.service_name,
                error_code=f'upload_http_{response.status_code}',
            )
        log.debug('MinerU 文件上传成功 file={} bytes={}', file_name, len(data))

    async def _download_markdown(self, full_zip_url: str, transport_kwargs: dict[str, Any], file_name: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=MINERU_REQUEST_TIMEOUT_SECONDS, **transport_kwargs) as client:
                response = await client.get(full_zip_url)
        except httpx.TimeoutException as exc:
            raise DocumentParseError(
                'MinerU 结果下载超时', service_name=self.service_name, error_code='download_timeout'
            ) from exc
        if response.status_code != 200:
            raise _api_error(response)
        text = _pick_markdown_from_zip_bytes(response.content).strip()
        if not text:
            raise DocumentParseError(
                'MinerU 未返回任何文本内容', service_name=self.service_name, error_code='no_content'
            )
        return text

    # ------------------------------------------------------------------ 组装
    @staticmethod
    def _file_item(file_name: str, request_params: dict[str, Any]) -> dict[str, Any]:
        item: dict[str, Any] = {'name': file_name}
        if request_params['data_id']:
            item['data_id'] = request_params['data_id']
        if request_params['page_ranges']:
            item['page_ranges'] = request_params['page_ranges']
        if request_params['is_ocr'] is not False:
            item['is_ocr'] = True
        return item

    @staticmethod
    def _batch_options(request_params: dict[str, Any]) -> dict[str, Any]:
        options: dict[str, Any] = {'model_version': request_params['model_version']}
        if request_params['enable_formula'] is not True:
            options['enable_formula'] = False
        if request_params['enable_table'] is not True:
            options['enable_table'] = False
        if request_params['language'] != 'ch':
            options['language'] = request_params['language']
        return options

    async def _poll_result(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        batch_id: str,
        file_name: str,
        timeout: float,
        poll_interval: float,
    ) -> dict[str, Any]:
        deadline = asyncio.get_event_loop().time() + timeout
        while True:
            response = await client.get(f'{self.api_base}{MINERU_EXTRACT_RESULTS_PATH}/{batch_id}', headers=headers)
            if response.status_code != 200:
                raise _api_error(response)
            body = response.json()
            _raise_for_api(response, body)
            entries = (body.get('data') or {}).get('extract_result') or []
            for entry in entries:
                if str(entry.get('file_name') or '') != file_name:
                    continue
                state = str(entry.get('state') or '')
                if state == 'done':
                    return dict(entry)
                if state == 'failed':
                    raise DocumentParseError(
                        f'MinerU 解析失败: {entry.get("err_msg") or "未知错误"}',
                        service_name=self.service_name,
                        error_code='mineru_failed',
                    )
            if asyncio.get_event_loop().time() >= deadline:
                raise DocumentParseError(
                    f'MinerU 解析超时（>{timeout:.0f}s）',
                    service_name=self.service_name,
                    error_code='timeout',
                )
            await asyncio.sleep(max(0.1, poll_interval))

    # ------------------------------------------------------------------ 健康
    async def check_health(self) -> dict[str, Any]:
        token = settings.MINERU_API_TOKEN
        if not token:
            return {
                'status': 'unavailable',
                'message': '未配置 MINERU_API_TOKEN（mineru.net API 管理页面创建）',
                'details': {'api_base': self.api_base},
            }
        transport_kwargs = {'transport': self._transport} if self._transport is not None else {}
        try:
            async with httpx.AsyncClient(timeout=5, **transport_kwargs) as client:
                response = await client.get(self.api_base)
        except Exception as exc:
            return {'status': 'unavailable', 'message': f'MinerU 公网 API 无法连接: {exc}', 'details': {}}
        if response.status_code == 200:
            return {
                'status': 'healthy',
                'message': 'MinerU 精准解析 API 配置可用（token 已设置，网关可达）',
                'details': {'api_base': self.api_base},
            }
        return {'status': 'unhealthy', 'message': f'MinerU 网关响应异常: {response.status_code}', 'details': {}}


__all__ = [
    'MINERU_EXTRACT_RESULTS_PATH',
    'MINERU_FILE_URLS_PATH',
    'MinerUPublicProcessor',
    '_pick_markdown_from_zip_bytes',
    '_raise_for_api',
]
