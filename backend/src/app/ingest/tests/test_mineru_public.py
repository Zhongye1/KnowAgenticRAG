"""MinerU 公网精准解析 API 引擎单测（ragf-design D8 修订：mineru.net v4，MockTransport 无网络）。

覆盖：token 缺失不可用、申请上传地址 → PUT → 轮询 → 下载 ZIP 取 Markdown 全链、
failed/业务错误码映射、payload 最小化（is_ocr/公式/表格为 API 默认时省略）。
"""

from __future__ import annotations

import asyncio
import io
import json
import zipfile

from typing import Any

import httpx
import pytest

from backend.src.app.ingest.parser.base import DocumentParseError, ProcessorUnavailableError
from backend.src.app.ingest.parser.processors.mineru_public import (
    MINERU_EXTRACT_RESULTS_PATH,
    MINERU_FILE_URLS_PATH,
    MinerUPublicProcessor,
)
from backend.src.core.config import settings


def _run(awaitable: Any) -> Any:
    return asyncio.run(awaitable)


def _zip_with_markdown(markdown: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        archive.writestr('full.md', markdown)
        archive.writestr('layout.json', '{}')
    return buffer.getvalue()


def _json_response(payload: dict[str, Any]) -> httpx.Response:
    return httpx.Response(200, json=payload)


class _MinerUFakeAPI:
    """MinerU v4 假服务：batch 申请 → 上传 → 轮询（running→done）→ zip 下载。"""

    def __init__(self, markdown: str = '# MinerU 输出\n\n解析正文。') -> None:
        self.markdown = markdown
        self.calls: list[tuple[str, str, Any]] = []
        self.batch_id = 'batch-0001'
        self.upload_url = 'https://upload.example/mineru/upload'
        self.zip_url = 'https://cdn.example/mineru/out.zip'
        self.poll_count = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append((request.method, str(request.url), request.content))
        path = request.url.path
        if request.method == 'POST' and path == MINERU_FILE_URLS_PATH:
            return _json_response({
                'code': 0,
                'data': {'batch_id': self.batch_id, 'file_urls': [self.upload_url]},
                'msg': 'ok',
                'trace_id': 't1',
            })
        if request.method == 'PUT' and str(request.url).startswith(self.upload_url):
            return httpx.Response(200)
        if request.method == 'GET' and path == f'{MINERU_EXTRACT_RESULTS_PATH}/{self.batch_id}':
            self.poll_count += 1
            state = 'done' if self.poll_count > 1 else 'running'
            entry: dict[str, Any] = {'file_name': 'demo.pdf', 'state': state, 'err_msg': ''}
            if state == 'done':
                entry['full_zip_url'] = self.zip_url
            return _json_response({'code': 0, 'data': {'extract_result': [entry]}, 'msg': 'ok'})
        if request.method == 'GET' and str(request.url).startswith(self.zip_url):
            return httpx.Response(200, content=_zip_with_markdown(self.markdown))
        return httpx.Response(404)


def _processor(fake: _MinerUFakeAPI) -> MinerUPublicProcessor:
    return MinerUPublicProcessor(transport=httpx.MockTransport(fake.handler))


def _enable_token(monkeypatch: pytest.MonkeyPatch, token: str = 'sk-mineru') -> None:
    monkeypatch.setattr(settings, 'MINERU_API_TOKEN', token)
    monkeypatch.setattr(settings, 'RAGF_MINERU_POLL_INTERVAL_SECONDS', 0.01)
    monkeypatch.setattr(settings, 'RAGF_MINERU_TIMEOUT_SECONDS', 5.0)


def test_mineru_token_unset_raises_unavailable() -> None:
    """未配置 MINERU_API_TOKEN → ProcessorUnavailableError（工厂降级链接管）。"""
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(settings, 'MINERU_API_TOKEN', None)
    try:
        processor = MinerUPublicProcessor()
        with pytest.raises(ProcessorUnavailableError) as exc_info:
            _run(processor.parse_bytes(b'pdf', 'demo.pdf', {}))
        assert exc_info.value.error_code == 'token_unset'
    finally:
        monkeypatch.undo()


def test_mineru_parse_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    """申请上传地址 → PUT 原始字节（无 Content-Type）→ 轮询 done → zip 取 Markdown。"""
    _enable_token(monkeypatch)
    monkeypatch.setattr(settings, 'RAGF_MINERU_MODEL_VERSION', 'pipeline')
    fake = _MinerUFakeAPI(markdown='# MinerU 输出\n\n解析正文。')
    markdown = _run(_processor(fake).parse_bytes(b'pdf-bytes', 'demo.pdf', {}))
    assert markdown == '# MinerU 输出\n\n解析正文。'
    methods = [call[0] for call in fake.calls]
    assert methods == ['POST', 'PUT', 'GET', 'GET', 'GET']  # 申请/上传/轮询(running/done)/zip 下载
    put_content = next(content for method, _url, content in fake.calls if method == 'PUT')
    assert put_content == b'pdf-bytes'
    # payload：settings 默认 is_ocr=True 显式带上；formula/table/language 为 API 默认值时省略
    apply_body = json.loads(next(content for method, _url, content in fake.calls if method == 'POST'))
    assert apply_body == {
        'files': [{'name': 'demo.pdf', 'is_ocr': True}],
        'model_version': 'pipeline',
    }


def test_mineru_payload_ocr_off_omitted(monkeypatch: pytest.MonkeyPatch) -> None:
    """params 覆盖 is_ocr=False（API 默认）→ file 项省略 is_ocr；formula/table 默认 True 省略。"""
    _enable_token(monkeypatch)
    fake = _MinerUFakeAPI()
    processor = _processor(fake)
    _run(processor.parse_bytes(b'pdf', 'demo.pdf', {'mineru_is_ocr': False}))
    apply_body = json.loads(next(content for method, _url, content in fake.calls if method == 'POST'))
    assert apply_body['files'][0] == {'name': 'demo.pdf'}
    assert 'enable_formula' not in apply_body and 'enable_table' not in apply_body


def test_mineru_failed_state_maps_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """轮询 state=failed → DocumentParseError（err_msg 结构化保留）。"""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == 'POST':
            return _json_response({
                'code': 0,
                'data': {'batch_id': 'b', 'file_urls': ['https://upload.example/u']},
            })
        if request.method == 'PUT':
            return httpx.Response(200)
        return _json_response({
            'code': 0,
            'data': {'extract_result': [{'file_name': 'demo.pdf', 'state': 'failed', 'err_msg': '文件页数超过限制'}]},
        })

    _enable_token(monkeypatch)
    processor = MinerUPublicProcessor(transport=httpx.MockTransport(handler))
    with pytest.raises(DocumentParseError) as exc_info:
        _run(processor.parse_bytes(b'pdf', 'demo.pdf', {}))
    assert exc_info.value.error_code == 'mineru_failed'
    assert '文件页数超过限制' in str(exc_info.value)


def test_mineru_api_business_error_maps(monkeypatch: pytest.MonkeyPatch) -> None:
    """业务错误码（A0202 Token 错误）→ DocumentParseError 带 mineru_api_ 前缀。"""

    def handler(request: httpx.Request) -> httpx.Response:
        return _json_response({'code': 'A0202', 'msg': 'Token 错误', 'data': None})

    _enable_token(monkeypatch)
    processor = MinerUPublicProcessor(transport=httpx.MockTransport(handler))
    with pytest.raises(DocumentParseError) as exc_info:
        _run(processor.parse_bytes(b'pdf', 'demo.pdf', {}))
    assert exc_info.value.error_code == 'mineru_api_A0202'
    assert 'Token 错误' in str(exc_info.value)


def test_mineru_check_health_token_unset() -> None:
    """健康检查：token 未配置 → unavailable（不发起网络请求）。"""
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(settings, 'MINERU_API_TOKEN', None)
    try:
        result = _run(MinerUPublicProcessor().check_health())
    finally:
        monkeypatch.undo()
    assert result['status'] == 'unavailable'


def test_mineru_check_health_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    """健康检查：token 配置 + 网关可达 → healthy。"""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200)

    _enable_token(monkeypatch)
    processor = MinerUPublicProcessor(transport=httpx.MockTransport(handler))
    result = _run(processor.check_health())
    assert result['status'] == 'healthy'
