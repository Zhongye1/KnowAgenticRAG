"""路由 selector 策略链（双管线摄取 spec D3，EagleRAG ingest/selectors.py 迁移）。

每个 selector 实现一个路由决策：返回管线列表（表态）或 None（弃权，交给下一
级）。``FallbackChain`` 按序尝试，首个非 None 生效；全部弃权落 default_pipeline。
selector 全部经构造函数注入配置，不读全局 settings，便于单测。
"""

from __future__ import annotations

from typing import Protocol

from backend.src.app.ingest.routing.context import (
    PIPELINE_KNOWHERE,
    PIPELINE_VISUAL,
    RouteContext,
)
from backend.src.common.log import log

__all__ = [
    'ExtensionSelector',
    'FallbackChain',
    'ForcedModeSelector',
    'HttpUriSelector',
    'PdfFormSelector',
    'PrefixSelector',
    'RouteSelector',
]


class RouteSelector(Protocol):
    """路由 selector 协议：表态返回管线列表，弃权返回 None。"""

    def select(self, ctx: RouteContext) -> list[str] | None: ...


class PrefixSelector:
    """文件名前缀强制（knowhere:xxx.pdf / pixelrag:xxx.jpg → 单管线）。"""

    def __init__(self, *, prefix_force: dict[str, str]) -> None:
        self.prefix_force = {k.lower(): v for k, v in (prefix_force or {}).items()}

    def select(self, ctx: RouteContext) -> list[str] | None:
        lower = ctx.filename.lower()
        for prefix, pipeline in self.prefix_force.items():
            if lower.startswith(prefix):
                return [pipeline]
        return None


class ForcedModeSelector:
    """生效路由模式强制（text/visual/hybrid）；auto 弃权进策略链。"""

    def select(self, ctx: RouteContext) -> list[str] | None:
        return ctx.forced_pipelines


class HttpUriSelector:
    """http/https URL 来源 → visual（CDP 截图渲染；spec D10）。"""

    def select(self, ctx: RouteContext) -> list[str] | None:
        if ctx.is_http:
            return [PIPELINE_VISUAL]
        return None


class PdfFormSelector:
    """PDF 形态探测：文本页占比 / 每页均字符数低于阈值 → scanned → visual。

    探测失败或无 local_path 保守回退 knowhere（文本解析对扫描件仅退化不崩溃）；
    文档形态不可判定时走 Knowhere 的 OCR 能力比走视觉切片更稳。
    """

    def __init__(self, *, probe: object, text_page_ratio_default: float, avg_chars_per_page: int) -> None:
        self.probe = probe  # callable(path, *, text_page_ratio) -> 'text' | 'scanned'
        self.text_page_ratio_default = text_page_ratio_default
        self.avg_chars_per_page = avg_chars_per_page

    def select(self, ctx: RouteContext) -> list[str] | None:
        if not ctx.is_pdf:
            return None
        if not ctx.local_path:
            return [PIPELINE_KNOWHERE]
        try:
            form = self.probe(ctx.local_path, text_page_ratio=ctx.text_page_ratio)  # type: ignore[operator]
        except Exception as exc:
            log.warning('PDF 形态探测失败，回退 knowhere: {}', exc)
            return [PIPELINE_KNOWHERE]
        log.info('PDF 形态探测完成 file={} form={}', ctx.cleaned_name, form)
        return [PIPELINE_VISUAL] if form == 'scanned' else [PIPELINE_KNOWHERE]


class ExtensionSelector:
    """扩展名命中：knowhere 集（文档类）/ visual 集（图片类）；未命中弃权。"""

    def __init__(
        self,
        *,
        knowhere_exts: list[str],
        visual_exts: list[str],
    ) -> None:
        self.knowhere_exts = {self._dot(e) for e in knowhere_exts}
        self.visual_exts = {self._dot(e) for e in visual_exts}

    @staticmethod
    def _dot(ext: str) -> str:
        return ext if ext.startswith('.') else f'.{ext}'

    def select(self, ctx: RouteContext) -> list[str] | None:
        if ctx.ext in self.knowhere_exts:
            return [PIPELINE_KNOWHERE]
        if ctx.ext in self.visual_exts:
            return [PIPELINE_VISUAL]
        return None


class FallbackChain:
    """按序尝试 selector，首个非 None 生效；全部弃权落 default_pipeline。"""

    def __init__(self, selectors: list[RouteSelector], *, default_pipeline: str) -> None:
        self.selectors = selectors
        self.default_pipeline = default_pipeline

    def select(self, ctx: RouteContext) -> list[str]:
        for selector in self.selectors:
            decision = selector.select(ctx)
            if decision is not None:
                return decision
        log.warning('全部路由 selector 弃权，回退默认管线 {} file={}', self.default_pipeline, ctx.cleaned_name)
        return [self.default_pipeline]
