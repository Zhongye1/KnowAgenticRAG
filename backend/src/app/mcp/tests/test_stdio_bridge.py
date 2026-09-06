"""stdio 回落桥集成测试（agent-layer spec M10/D20/D22）。

以子进程启动 ``backend/scripts/mcp_bridge.py``（纯标准库），对本地 HTTP 服务器做
真实转发：验证 env PAT 注入 Authorization、JSON-RPC 帧换行协议、通知不回写、
非 2xx 的 JSON-RPC 错误体透传。不依赖后端服务与容器。
"""

from __future__ import annotations

import json
import subprocess
import sys
import threading

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

BRIDGE = Path(__file__).resolve().parents[4] / 'scripts' / 'mcp_bridge.py'
PAT = 'bridge-secret-pat'


class _RpcHttpHandler(BaseHTTPRequestHandler):
    """本地桩 MCP 端点：校验鉴权头并回显 JSON-RPC 结果；mode=unauthorized 返回 401。"""

    mode = 'ok'
    requests: list[dict[str, Any]] = []

    def do_POST(self) -> None:  # http.server 回调方法名固定
        length = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(length) or b'{}')
        self.requests.append({
            'path': self.path,
            'auth': self.headers.get('Authorization'),
            'accept': self.headers.get('Accept'),
            'body': body,
        })
        if self.mode == 'unauthorized':
            self.send_response(401)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_reply = {
                'jsonrpc': '2.0',
                'id': body.get('id'),
                'error': {'code': -32001, 'message': 'unauthorized'},
            }
            payload = json.dumps(error_reply).encode('utf-8')
            self.wfile.write(payload)
            return
        payload = json.dumps(body).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: Any) -> None:  # 静音访问日志（format 为 http.server 参数名）
        return


def _run_bridge(url: str, stdin: str, *, pat: str = PAT) -> subprocess.CompletedProcess[str]:
    env = {'RAGF_MCP_HTTP_URL': url, 'RAGF_MCP_PAT': pat}
    return subprocess.run(
        [sys.executable, str(BRIDGE)],
        input=stdin,
        capture_output=True,
        text=True,
        timeout=30,
        env=env,
    )


def test_bridge_forwards_with_pat_and_echoes_rpc(
    client_mode_server: Callable[[str], tuple[ThreadingHTTPServer, int]],
) -> None:
    """PAT 注入 Authorization；同 id 请求收到同 id 响应帧（非通知行才回写）。"""
    server, port = client_mode_server('ok')
    initialize = {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-03-26'}}
    notification = {'jsonrpc': '2.0', 'method': 'notifications/initialized'}
    tools = {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'}
    result = _run_bridge(f'http://127.0.0.1:{port}/mcp', '\n'.join(map(json.dumps, [initialize, notification, tools])))
    server.shutdown()
    assert result.returncode == 0, result.stderr
    lines = [json.loads(line) for line in result.stdout.splitlines()]
    assert [line['id'] for line in lines] == [1, 2], '通知帧不应回写，仅带 id 的请求回写响应'
    assert lines[0] == initialize and lines[1] == tools
    assert len(_RpcHttpHandler.requests) == 3
    for request in _RpcHttpHandler.requests:
        assert request['auth'] == f'Bearer {PAT}'
        assert request['accept'] == 'application/json'
    assert _RpcHttpHandler.requests[0]['path'] == '/mcp'


def test_bridge_passes_through_jsonrpc_error_body(
    client_mode_server: Callable[[str], tuple[ThreadingHTTPServer, int]],
) -> None:
    """非 2xx 且响应为 JSON-RPC 错误体时原样透传（保留原 id）。"""
    server, port = client_mode_server('unauthorized')
    request = {'jsonrpc': '2.0', 'id': 7, 'method': 'tools/call', 'params': {'name': 'x'}}
    result = _run_bridge(f'http://127.0.0.1:{port}/mcp', json.dumps(request))
    server.shutdown()
    assert result.returncode == 0, result.stderr
    lines = [json.loads(line) for line in result.stdout.splitlines()]
    assert len(lines) == 1
    assert lines[0]['id'] == 7
    assert 'error' in lines[0] and lines[0]['error']['code'] == -32001


def test_bridge_missing_url_exits_with_usage() -> None:
    """未配置 RAGF_MCP_HTTP_URL 时退出码 2 并给出用法提示。"""
    result = subprocess.run(
        [sys.executable, str(BRIDGE)],
        input='',
        capture_output=True,
        text=True,
        timeout=30,
        env={'RAGF_MCP_PAT': PAT},
    )
    assert result.returncode == 2
    assert 'RAGF_MCP_HTTP_URL' in result.stderr


@pytest.fixture()
def client_mode_server() -> Iterator[Callable[[str], tuple[ThreadingHTTPServer, int]]]:
    def _start(mode: str) -> tuple[ThreadingHTTPServer, int]:
        _RpcHttpHandler.mode = mode
        _RpcHttpHandler.requests = []
        server = ThreadingHTTPServer(('127.0.0.1', 0), _RpcHttpHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return server, int(server.server_address[1])

    yield _start
    _RpcHttpHandler.requests = []
