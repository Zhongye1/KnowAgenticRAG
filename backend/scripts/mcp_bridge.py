"""MCP stdio → Streamable HTTP 本地桥接进程（agent-layer spec M10/D20/D22，stdio 回落）。

宿主（Codex / 无原生远程认证的 MCP client）以 stdio 方式启动本进程；本进程把
JSON-RPC 帧逐行转发到远程 ``POST {RAGF_MCP_HTTP_URL}``，并注入桥接凭证头
（``Authorization: Bearer {RAGF_MCP_PAT}``）。凭证只在本机进程内可见，不进
客户端配置文件，也不落到 prompt/工具参数（D22）。桥接进程只做转发，不含业务
密钥与数据面（§9.1 红线：stdio 回落 ≠ 本地部署 RAGF server）。

用法（仓库根目录，venv 内任意 python3 即可，纯标准库）：
  RAGF_MCP_HTTP_URL=http://127.0.0.1:8000/mcp RAGF_MCP_PAT=xxx \\
    python backend/scripts/mcp_bridge.py

Codex 配置示例（.mcp.json 或 codex mcp add，cwd=仓库根目录）：
  {"mcpServers": {"ragf": {
     "command": "backend/.venv/bin/python",
     "args": ["backend/scripts/mcp_bridge.py"],
     "env": {"RAGF_MCP_HTTP_URL": "http://127.0.0.1:8000/mcp", "RAGF_MCP_PAT": "xxx"}
  }}}

stdin/stdout 协议：每行一条 JSON-RPC 2.0 消息（MCP stdio 换行分帧）；
通知（无 ``id``）转发但不回写；错误/异常按原 id 回一条 JSON-RPC error，进程不退出。
"""

from __future__ import annotations

import json
import logging
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger('ragf.mcp.bridge')

_HTTP_TIMEOUT_SECONDS = 60.0
_INTERNAL_ERROR_CODE = -32000


def forward_message(message: dict, *, url: str, pat: str) -> dict | None:
    """转发单条 JSON-RPC 消息到远程 /mcp，返回应回写 stdout 的响应帧（通知返回 None）。"""
    if urllib.parse.urlsplit(url).scheme not in {'http', 'https'}:
        raise ValueError(f'RAGF_MCP_HTTP_URL 仅支持 http/https: {url}')
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    if pat:
        headers['Authorization'] = f'Bearer {pat}'
    body = json.dumps(message, ensure_ascii=False).encode('utf-8')
    request = urllib.request.Request(url, data=body, headers=headers, method='POST')  # ruff: ignore[suspicious-url-open-usage] -- scheme 已在上方白名单校验 http/https
    try:
        with urllib.request.urlopen(request, timeout=_HTTP_TIMEOUT_SECONDS) as response:  # ruff: ignore[suspicious-url-open-usage] -- 同 URL 白名单校验
            payload = response.read()
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        status = exc.code
    except Exception as exc:  # 网络层异常：按原 id 合成错误帧
        logger.error('转发失败 %s: %s', url, exc)
        return _error_frame(message, _INTERNAL_ERROR_CODE, f'bridge network error: {exc}')
    else:
        status = 200
    if not payload:
        return None
    try:
        reply = json.loads(payload)
    except json.JSONDecodeError:
        logger.error('远程返回非 JSON status=%s: %s', status, payload[:200])
        return _error_frame(message, _INTERNAL_ERROR_CODE, f'bridge: remote returned non-JSON (status {status})')
    if status >= 400 and not (isinstance(reply, dict) and ('error' in reply or 'result' in reply)):
        return _error_frame(message, _INTERNAL_ERROR_CODE, f'bridge: remote HTTP {status}')
    return reply


def _error_frame(message: dict, code: int, text: str) -> dict | None:
    """按原请求 id 合成 JSON-RPC error 帧；通知类消息不回写。"""
    req_id = message.get('id')
    if req_id is None:
        return None
    return {'jsonrpc': '2.0', 'id': req_id, 'error': {'code': code, 'message': text}}


def run_bridge(url: str, pat: str) -> int:
    """stdin 逐行转发循环；EOF 正常退出。"""
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            message = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning('忽略非法 JSON-RPC 帧: %s', exc)
            continue
        if not isinstance(message, dict):
            logger.warning('忽略非对象 JSON-RPC 帧')
            continue
        reply = forward_message(message, url=url, pat=pat)
        if reply is not None and 'id' in reply:  # 通知类消息即使被远端回包也不回写（MCP 协议）
            sys.stdout.write(json.dumps(reply, ensure_ascii=False) + '\n')
            sys.stdout.flush()
    return 0


def main() -> int:
    """从环境变量读取配置并启动桥接循环。"""
    url = str(os.environ.get('RAGF_MCP_HTTP_URL') or '').strip()
    if not url:
        print('缺少 RAGF_MCP_HTTP_URL（远程 MCP 端点，如 http://127.0.0.1:8000/mcp）', file=sys.stderr)
        return 2
    pat = str(os.environ.get('RAGF_MCP_PAT') or '')
    logging.basicConfig(level=logging.WARNING, stream=sys.stderr, format='%(levelname)s %(message)s')
    return run_bridge(url, pat)


if __name__ == '__main__':
    raise SystemExit(main())
