"""URL 摄取校验与 SSRF 防护（双管线摄取 spec D10，EagleRAG url_validator 迁移）。

摄取入口在派发前依次执行：

1. ``validate_url_format`` —— 仅接受 http/https、必须有 host、拒绝 userinfo、端口合法；
2. ``assert_not_ssrf_target`` —— 解析 DNS（带硬超时），拒绝私网/环回/链路本地/
   云元数据地址；**重定向后的最终 URL 由下载函数复检**；
3. ``assert_egress_allowlist`` —— 部署级出网白名单（``RAGF_URL_EGRESS_ALLOWLIST``，
   空 = 允许全部公网）；
4. ``download_url_capped`` —— 流式下载，限额（spec D8）与最终 URL SSRF 复检。

错误结构化（code/reason/suggestion），API 层映射 422 ``detail``。
"""

from __future__ import annotations

import ipaddress
import os
import socket
import tempfile

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from backend.src.common.log import log

__all__ = [
    'UrlValidationError',
    'assert_egress_allowlist',
    'assert_not_ssrf_target',
    'download_url_capped',
    'validate_url_format',
]

_ALLOWED_SCHEMES = {'http', 'https'}
_UA = 'RAGF/1.0 (URL ingest)'

# 用户提供的 URL 绝不允许触达的网络（含云元数据 169.254.169.254）
_FORBIDDEN_NETWORKS: tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...] = (
    ipaddress.ip_network('127.0.0.0/8', strict=False),
    ipaddress.ip_network('10.0.0.0/8', strict=False),
    ipaddress.ip_network('172.16.0.0/12', strict=False),
    ipaddress.ip_network('192.168.0.0/16', strict=False),
    ipaddress.ip_network('169.254.0.0/16', strict=False),
    ipaddress.ip_network('0.0.0.0/8', strict=False),
    ipaddress.ip_network('::1/128', strict=False),
    ipaddress.ip_network('fc00::/7', strict=False),
    ipaddress.ip_network('fe80::/10', strict=False),
)


class UrlValidationError(Exception):
    """用户提供的 URL 未通过校验/下载。"""

    def __init__(self, code: str, reason: str, suggestion: str | None = None) -> None:
        super().__init__(reason)
        self.code = code
        self.reason = reason
        self.suggestion = suggestion

    def __str__(self) -> str:
        return self.reason

    def to_detail(self) -> dict[str, Any]:
        """422 响应的 JSON ``detail`` 载荷。"""
        detail: dict[str, Any] = {'code': self.code, 'reason': self.reason}
        if self.suggestion is not None:
            detail['suggestion'] = self.suggestion
        return detail


def validate_url_format(url: str) -> None:
    """校验 URL 语法形态：scheme/host/userinfo/端口。"""
    try:
        parsed = urlparse(url)
    except ValueError as exc:
        raise UrlValidationError('invalid_url_format', f'URL 无法解析: {exc}') from exc

    scheme = (parsed.scheme or '').lower()
    if scheme not in _ALLOWED_SCHEMES:
        raise UrlValidationError(
            'invalid_url_format',
            f'URL scheme 必须是 http/https，实际为 {scheme!r}',
            suggestion='请使用以 http:// 或 https:// 开头的 URL',
        )
    if not parsed.hostname:
        raise UrlValidationError('invalid_url_format', 'URL 必须包含 host')
    if parsed.username is not None or parsed.password is not None:
        raise UrlValidationError(
            'invalid_url_format',
            'URL 不允许携带 user:password@ 凭据',
        )
    port = parsed.port
    if port is not None and not (1 <= port <= 65535):
        raise UrlValidationError('invalid_url_format', f'URL 端口越界: {port}')


def _resolve_host_ips(host: str, *, timeout_sec: float) -> list[str]:
    """解析 host 全部地址（线程池硬超时，防 DNS 卡死）。"""
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(lambda: [str(info[4][0]) for info in socket.getaddrinfo(host, None)])
        try:
            return future.result(timeout=timeout_sec)
        except FuturesTimeoutError as exc:
            future.cancel()
            raise UrlValidationError(
                'url_timeout',
                f'host {host} DNS 解析超时（{timeout_sec}s）',
            ) from exc


def _is_forbidden_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return any(ip in net for net in _FORBIDDEN_NETWORKS)


def assert_not_ssrf_target(url: str, *, dns_timeout_sec: float = 3.0) -> None:
    """解析 URL host 并拒绝私网/环回/元数据地址（IP 字面量直接判定）。"""
    host = urlparse(url).hostname
    if not host:
        raise UrlValidationError('invalid_url_format', 'URL 必须包含 host')

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if _is_forbidden_ip(ip):
            raise UrlValidationError(
                'url_target_forbidden',
                f'URL 指向受限地址（私网/环回/元数据）: {ip}',
                suggestion='请提供公网可访问的 URL',
            )
        return

    try:
        ip_strs = _resolve_host_ips(host, timeout_sec=dns_timeout_sec)
    except UrlValidationError:
        raise
    except socket.gaierror as exc:
        raise UrlValidationError('url_unreachable', f'host {host} DNS 解析失败: {exc}') from exc

    for ip_str in ip_strs:
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if _is_forbidden_ip(ip):
            raise UrlValidationError(
                'url_target_forbidden',
                f'URL 解析到受限地址（私网/环回/元数据）: {ip}',
                suggestion='请提供公网可访问的 URL',
            )


def assert_egress_allowlist(url: str) -> None:
    """部署级出网白名单（域名后缀匹配；配置为空 = 不限制）。"""
    from backend.src.core.config import settings

    allowlist = [a.strip().lower() for a in (settings.RAGF_URL_EGRESS_ALLOWLIST or []) if a.strip()]
    if not allowlist:
        return
    host = (urlparse(url).hostname or '').lower()
    if not any(host == suffix or host.endswith(f'.{suffix}') for suffix in allowlist):
        raise UrlValidationError(
            'url_not_allowed',
            f'host {host} 不在部署出网白名单内',
            suggestion=f'允许的域名后缀: {allowlist}',
        )


def _is_tls_verify_error(exc: BaseException) -> bool:
    cur: BaseException | None = exc
    while cur is not None:
        text = str(cur).lower()
        if 'certificate_verify_failed' in text or 'ssl: certificate' in text:
            return True
        cur = cur.__cause__ or cur.__context__
        if cur is exc:
            break
    return False


def download_url_capped(  # ruff:ignore[complex-structure] —— 下载/限额/SSRF 复检分支本质复杂
    url: str,
    *,
    max_bytes: int,
    timeout: float = 30.0,
    max_redirects: int = 3,
) -> tuple[Path, str, int]:
    """流式下载 URL 到临时文件，返回 (路径, content_type, 字节数)。

    限额（spec D8）超限即断；重定向后的最终 URL 复检 SSRF 后才落盘可信内容。
    TLS 验证失败按配置降级重试一次（部分站点证书链不完整）。
    """
    from backend.src.app.ingest.limits import IngestLimitError
    from backend.src.core.config import settings

    tmp_path: Path | None = None

    def _attempt(*, verify: bool) -> tuple[Path, str, int]:
        nonlocal tmp_path
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
        fd, tmp_name = tempfile.mkstemp(prefix='ragf_url_')
        os.close(fd)
        tmp_path = Path(tmp_name)
        written = 0
        content_type = ''
        with httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            max_redirects=max_redirects,
            headers={'User-Agent': _UA},
            verify=verify,
        ) as client:
            with client.stream('GET', url) as resp:
                if not (200 <= resp.status_code < 300):
                    raise UrlValidationError(
                        'url_bad_status', f'HTTP {resp.status_code}', suggestion='URL 必须返回 2xx'
                    )
                # 重定向后的最终地址复检 SSRF + 白名单（spec D10）
                final_url = str(resp.url)
                assert_not_ssrf_target(final_url)
                assert_egress_allowlist(final_url)
                content_type = resp.headers.get('content-type', '')
                for chunk in resp.iter_bytes():
                    if not chunk:
                        continue
                    written += len(chunk)
                    if max_bytes and written > max_bytes:
                        raise IngestLimitError(
                            'file_too_large',
                            f'URL 内容超过 {max_bytes} 字节上限（MinerU 精提取 API 限制）',
                            suggestion='请提供更小的文件直链',
                        )
                    with open(tmp_path, 'ab') as fh:
                        fh.write(chunk)
        return tmp_path, content_type, written

    try:
        return _attempt(verify=True)
    except httpx.ConnectError as exc:
        tmp_path = None  # _attempt 内部已清理
        if settings.RAGF_URL_INGEST_ENABLED and _is_tls_verify_error(exc):
            log.warning('URL TLS 验证失败，按降级策略重试（不验证）: {}', url)
            return _attempt(verify=False)
        raise UrlValidationError('url_unreachable', f'无法连接 {url}: {exc}') from exc
    except httpx.TimeoutException as exc:
        raise UrlValidationError('url_timeout', f'请求 {url} 超时（{timeout}s）') from exc
    except httpx.HTTPError as exc:
        raise UrlValidationError('url_unreachable', f'下载 {url} 失败: {exc}') from exc
    except Exception:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
        raise
