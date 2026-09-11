"""路由上下文（双管线摄取 spec D3，EagleRAG IngestRouteContext 迁移）。

入口预计算派生字段，selector 只读；``routing_mode`` 为 KB 行与全局配置合成后的
生效值，``local_path`` 仅 PDF 形态探测需要（无则探测 selector 弃权）。
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = ['RouteContext']

# 管线名（spec D1）：knowhere=Knowhere 语义解析；visual=PixelRAG 视觉
# （legacy 工厂链已删除——未上线直接迁移；引擎不可用时路由 fail-closed）
PIPELINE_KNOWHERE = 'knowhere'
PIPELINE_VISUAL = 'visual'

FORCED_MODE_PIPELINE = {
    'text': [PIPELINE_KNOWHERE],
    'visual': [PIPELINE_VISUAL],
    'hybrid': [PIPELINE_KNOWHERE, PIPELINE_VISUAL],
}


@dataclass(frozen=True)
class RouteContext:
    """摄取路由上下文。"""

    filename: str
    cleaned_name: str  # 剥离 knowhere:/pixelrag: 前缀后
    ext: str  # 小写扩展名（带点）
    local_path: str | None  # PDF 形态探测用；None 时探测 selector 弃权
    routing_mode: str  # 生效路由模式（auto/text/visual/hybrid）
    text_page_ratio: float | None  # KB 级 PDF 文本页占比阈值（None=全局默认）

    @property
    def is_pdf(self) -> bool:
        return self.ext == '.pdf'

    @property
    def forced_pipelines(self) -> list[str] | None:
        """routing_mode 强制的管线；auto/未知值返回 None（进入策略链）。"""
        return FORCED_MODE_PIPELINE.get(self.routing_mode)
