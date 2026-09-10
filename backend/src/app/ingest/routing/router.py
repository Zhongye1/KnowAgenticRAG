"""路由入口（双管线摄取 spec D2/D3，EagleRAG ingest/router.py 迁移）。

``route()`` 纯函数组装策略链；``resolve_effective_routing_mode`` 合成 KB 行与
全局配置；``filter_available_pipelines`` 把不可用引擎显式回退 legacy（日志可见，
不静默 mock）。任务派发在任务层（tasks/），本模块不触碰 Celery。
"""

from __future__ import annotations

from urllib.parse import urlparse

from backend.src.app.ingest.routing.context import (
    PIPELINE_KNOWHERE,
    PIPELINE_VISUAL,
    RouteContext,
)
from backend.src.app.ingest.routing.pdf_probe import probe_pdf_form
from backend.src.app.ingest.routing.selectors import (
    ExtensionSelector,
    FallbackChain,
    ForcedModeSelector,
    HttpUriSelector,
    PdfFormSelector,
    PrefixSelector,
)

__all__ = [
    'filter_available_pipelines',
    'resolve_effective_routing_mode',
    'resolve_routing_inputs',
    'route',
]


def resolve_effective_routing_mode(kb_routing_mode: str | None) -> str:
    """合成生效路由模式：KB 行 routing_mode 非 legacy 时优先，否则全局配置。"""
    from backend.src.core.config import settings

    mode = (kb_routing_mode or '').strip().lower()
    if mode in {'auto', 'text', 'visual', 'hybrid'}:
        return mode
    return (settings.RAGF_ROUTING_MODE or 'legacy').lower()


def _is_http_uri(source_uri: str | None) -> bool:
    if not source_uri:
        return False
    try:
        parsed = urlparse(source_uri)
    except ValueError:
        return False
    return parsed.scheme.lower() in {'http', 'https'}


def resolve_routing_inputs(
    *,
    filename: str,
    kb_routing_mode: str | None,
    text_page_ratio: float | None,
    source_uri: str | None = None,
    local_path: str | None = None,
) -> RouteContext:
    """由任务层输入构建 RouteContext（剥离前缀 / 派生扩展名 / 合成生效模式）。"""
    from backend.src.core.config import settings

    prefix_force = settings.RAGF_ROUTING_PREFIX_FORCE or {}
    lower = (filename or '').lower()
    cleaned = filename or ''
    for prefix in prefix_force:
        if lower.startswith(prefix):
            cleaned = filename[len(prefix) :]
            break
    dot = cleaned.rfind('.')
    ext = cleaned[dot:].lower() if dot >= 0 else ''
    return RouteContext(
        filename=filename or '',
        cleaned_name=cleaned,
        ext=ext,
        is_http=_is_http_uri(source_uri),
        local_path=local_path,
        routing_mode=resolve_effective_routing_mode(kb_routing_mode),
        text_page_ratio=text_page_ratio,
        source_uri=source_uri,
    )


def route(ctx: RouteContext) -> list[str]:
    """策略链路由：返回管线列表（[legacy] / [knowhere] / [visual] / 混合）。"""
    from backend.src.core.config import settings

    chain = FallbackChain(
        [
            PrefixSelector(prefix_force=settings.RAGF_ROUTING_PREFIX_FORCE),
            ForcedModeSelector(),
            HttpUriSelector(),
            PdfFormSelector(
                probe=probe_pdf_form,
                text_page_ratio_default=settings.RAGF_PDF_PROBE_TEXT_PAGE_RATIO,
                avg_chars_per_page=settings.RAGF_PDF_PROBE_AVG_CHARS_PER_PAGE,
            ),
            ExtensionSelector(
                knowhere_exts=settings.RAGF_ROUTING_KNOWHERE_EXTS,
                visual_exts=settings.RAGF_ROUTING_VISUAL_EXTS,
            ),
        ],
        default_pipeline=settings.RAGF_ROUTING_DEFAULT_PIPELINE,
    )
    return chain.select(ctx)


def filter_available_pipelines(pipelines: list[str], *, filename: str) -> list[str]:
    """按引擎可用性校验管线：不可用引擎直接 fail-closed 报错（spec D1）。

    引擎未安装 / 未部署（Knowhere 服务缺失、DashScope 无 key）时任务不可能
    成功，路由期即报错——legacy 工厂链已删除，无兜底；部署要求见 spec §6。
    """
    from backend.src.app.ingest.engine.availability import knowhere_available, visual_available

    unavailable: list[str] = []
    for pipeline in pipelines:
        if pipeline == PIPELINE_KNOWHERE:
            ok, reason = knowhere_available()
        elif pipeline == PIPELINE_VISUAL:
            ok, reason = visual_available()
        else:
            ok, reason = True, ''
        if not ok:
            unavailable.append(f'{pipeline}（{reason}）')
    if unavailable:
        raise RuntimeError(
            f'摄取引擎不可用: {"; ".join(unavailable)}；'
            f'请部署 Knowhere 服务 / 配置 DASHSCOPE_API_KEY（文档 {filename} 无法路由）'
        )
    return list(dict.fromkeys(pipelines))
