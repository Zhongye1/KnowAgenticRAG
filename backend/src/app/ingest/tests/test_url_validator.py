"""URL 摄取校验单测（双管线摄取 spec D10：格式/SSRF/白名单，纯函数无网络）。"""

from __future__ import annotations

import pytest

from backend.src.app.ingest.url_validator import (
    UrlValidationError,
    assert_egress_allowlist,
    assert_not_ssrf_target,
    validate_url_format,
)


def test_validate_url_format_rejects_bad_scheme() -> None:
    with pytest.raises(UrlValidationError) as exc:
        validate_url_format('ftp://example.com/a.pdf')
    assert exc.value.code == 'invalid_url_format'


def test_validate_url_format_rejects_userinfo_and_empty_host() -> None:
    with pytest.raises(UrlValidationError):
        validate_url_format('http://user:pass@example.com/a.pdf')
    with pytest.raises(UrlValidationError):
        validate_url_format('http:///path/a.pdf')


def test_validate_url_format_accepts_http() -> None:
    validate_url_format('https://example.com/docs/report.pdf')


@pytest.mark.parametrize(
    'url',
    [
        'http://127.0.0.1/a.pdf',  # 环回
        'http://169.254.169.254/latest/meta-data/',  # 云元数据
        'http://10.1.2.3/a.pdf',  # 私网 A 类
        'http://192.168.1.1/a.pdf',  # 私网 C 类
        'http://[::1]/a.pdf',  # IPv6 环回
    ],
)
def test_ssrf_rejects_forbidden_ip_literals(url: str) -> None:
    with pytest.raises(UrlValidationError) as exc:
        assert_not_ssrf_target(url)
    assert exc.value.code == 'url_target_forbidden'


def test_egress_allowlist(monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.src.core.config import settings

    monkeypatch.setattr(settings, 'RAGF_URL_EGRESS_ALLOWLIST', ['example.com'])
    assert_egress_allowlist('https://example.com/a.pdf')
    assert_egress_allowlist('https://cdn.example.com/a.pdf')
    with pytest.raises(UrlValidationError) as exc:
        assert_egress_allowlist('https://other.org/a.pdf')
    assert exc.value.code == 'url_not_allowed'


def test_egress_allowlist_empty_allows_all(monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.src.core.config import settings

    monkeypatch.setattr(settings, 'RAGF_URL_EGRESS_ALLOWLIST', [])
    assert_egress_allowlist('https://anything.org/a.pdf')
