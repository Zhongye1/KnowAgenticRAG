"""路由策略链单测（双管线摄取 spec D2/D3）。"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from backend.src.app.ingest.routing.context import RouteContext
from backend.src.app.ingest.routing.pdf_probe import probe_pdf_form
from backend.src.app.ingest.routing.router import (
    filter_available_pipelines,
    resolve_effective_routing_mode,
    resolve_routing_inputs,
    route,
)
from backend.src.app.ingest.routing.selectors import ExtensionSelector, FallbackChain
from backend.src.core.config import settings

if TYPE_CHECKING:
    from pathlib import Path


def _ctx(**overrides) -> RouteContext:
    base = {
        'filename': 'test.pdf',
        'cleaned_name': 'test.pdf',
        'ext': '.pdf',
        'is_http': False,
        'local_path': None,
        'routing_mode': 'auto',
        'text_page_ratio': None,
        'source_uri': None,
    }
    base.update(overrides)
    return RouteContext(**base)


def test_prefix_stripped_in_routing_inputs() -> None:
    ctx = resolve_routing_inputs(filename='knowhere:报告.pdf', kb_routing_mode=None, text_page_ratio=None)
    assert ctx.cleaned_name == '报告.pdf'
    assert ctx.ext == '.pdf'
    assert ctx.routing_mode == 'auto'  # 全局默认 auto（未上线直接切双管线）


def test_effective_mode_kb_overrides_global(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_ROUTING_MODE', 'auto')
    assert resolve_effective_routing_mode('visual') == 'visual'
    assert resolve_effective_routing_mode('bogus') == 'auto'  # 非法 KB 值落全局默认
    assert resolve_effective_routing_mode('') == 'auto'
    monkeypatch.setattr(settings, 'RAGF_ROUTING_MODE', 'hybrid')
    assert resolve_effective_routing_mode('bogus') == 'hybrid'


def test_route_forced_modes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_ROUTING_PREFIX_FORCE', {'knowhere:': 'knowhere', 'pixelrag:': 'visual'})
    assert route(_ctx(routing_mode='text')) == ['knowhere']
    assert route(_ctx(routing_mode='visual')) == ['visual']
    assert route(_ctx(routing_mode='hybrid')) == ['knowhere', 'visual']


def test_route_prefix_force_beats_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_ROUTING_PREFIX_FORCE', {'knowhere:': 'knowhere', 'pixelrag:': 'visual'})
    ctx = resolve_routing_inputs(filename='pixelrag:scan.pdf', kb_routing_mode='text', text_page_ratio=None)
    assert ctx.cleaned_name == 'scan.pdf'
    assert route(ctx) == ['visual']


def test_route_http_uri_goes_visual(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_ROUTING_PREFIX_FORCE', {})
    ctx = _ctx(is_http=True, source_uri='https://example.com/page')
    assert route(ctx) == ['visual']


def test_route_extension_sets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, 'RAGF_ROUTING_PREFIX_FORCE', {})
    monkeypatch.setattr(settings, 'RAGF_ROUTING_KNOWHERE_EXTS', ['pdf', 'docx', 'md'])
    monkeypatch.setattr(settings, 'RAGF_ROUTING_VISUAL_EXTS', ['png', 'jpg'])
    monkeypatch.setattr(settings, 'RAGF_ROUTING_DEFAULT_PIPELINE', 'knowhere')
    assert route(_ctx(filename='a.docx', cleaned_name='a.docx', ext='.docx')) == ['knowhere']
    assert route(_ctx(filename='a.png', cleaned_name='a.png', ext='.png')) == ['visual']
    assert route(_ctx(filename='a.pdf', cleaned_name='a.pdf', ext='.pdf', local_path='/tmp/x.pdf')) == ['knowhere']


def test_extension_selector_unsupported_ext_abstains() -> None:
    selector = ExtensionSelector(knowhere_exts=['pdf'], visual_exts=['png'])
    assert selector.select(_ctx(filename='a.zip', cleaned_name='a.zip', ext='.zip')) is None


def test_fallback_chain_default() -> None:
    chain = FallbackChain([], default_pipeline='knowhere')
    assert chain.select(_ctx()) == ['knowhere']


def test_pdf_probe_unreadable_falls_back_text(tmp_path: Path) -> None:
    bad = tmp_path / 'bad.pdf'
    bad.write_bytes(b'not a pdf')
    assert probe_pdf_form(str(bad)) == 'text'


def test_filter_availability_unavailable_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    import backend.src.app.ingest.engine.availability as availability

    monkeypatch.setattr(availability, 'knowhere_available', lambda: (False, 'off'))
    monkeypatch.setattr(availability, 'visual_available', lambda: (False, 'no key'))
    # filter 内部为延迟导入（每次调用重新 from import），monkeypatch 模块属性即可生效；
    # legacy 兜底已删除：不可用直接 fail-closed
    with pytest.raises(RuntimeError, match='摄取引擎不可用'):
        filter_available_pipelines(['knowhere', 'visual'], filename='x.pdf')


def test_filter_availability_available_kept_in_order(monkeypatch: pytest.MonkeyPatch) -> None:
    import backend.src.app.ingest.engine.availability as availability

    monkeypatch.setattr(availability, 'knowhere_available', lambda: (True, ''))
    monkeypatch.setattr(availability, 'visual_available', lambda: (True, ''))
    assert filter_available_pipelines(['knowhere', 'visual'], filename='x.pdf') == ['knowhere', 'visual']
    assert filter_available_pipelines(['knowhere'], filename='x.pdf') == ['knowhere']
