"""
metrics.py
系统监控模块 - Prometheus 指标暴露 + 轻量自采集

功能：
  - 暴露 /metrics 端点（Prometheus 格式）
  - 监控 API 响应时间、模型调用次数、知识库上传量
  - 无 prometheus_client 时提供纯 JSON /api/metrics/stats 降级接口
  - instrument_app：给 FastAPI app 注入中间件（自动统计请求时间）

API:
  GET /metrics              -- Prometheus scrape 端点
  GET /api/metrics/stats    -- JSON 格式当前统计（前端嵌入面板用）
  GET /api/metrics/echarts  -- ECharts 格式数据（前端直接渲染）
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Dict, List

from fastapi import APIRouter, Request, Response
from fastapi.routing import APIRoute

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/metrics", tags=["系统监控"])

# ─── 轻量内存统计（不依赖 prometheus_client）─────────────────
class _Stats:
    def __init__(self):
        self.request_count: Dict[str, int] = defaultdict(int)       # endpoint → count
        self.error_count:   Dict[str, int] = defaultdict(int)       # endpoint → errors
        self.latencies:     Dict[str, deque] = defaultdict(lambda: deque(maxlen=200))  # endpoint → [ms...]
        self.model_calls:   Dict[str, int] = defaultdict(int)       # model_name → count
        self.kb_uploads:    int = 0
        self.start_time:    float = time.time()

    def record_request(self, path: str, method: str, status: int, latency_ms: float):
        key = f"{method} {path}"
        self.request_count[key] += 1
        self.latencies[key].append(latency_ms)
        if status >= 400:
            self.error_count[key] += 1

    def record_model_call(self, model_name: str):
        self.model_calls[model_name] += 1

    def record_kb_upload(self):
        self.kb_uploads += 1

    def avg_latency(self, key: str) -> float:
        lats = self.latencies.get(key, [])
        return round(sum(lats) / len(lats), 1) if lats else 0.0

    def p99_latency(self, key: str) -> float:
        lats = sorted(self.latencies.get(key, []))
        if not lats:
            return 0.0
        idx = max(0, int(len(lats) * 0.99) - 1)
        return round(lats[idx], 1)

    def uptime_seconds(self) -> float:
        return round(time.time() - self.start_time, 1)


STATS = _Stats()


# ─── FastAPI 中间件注入 ───────────────────────────────────────
def instrument_app(app):
    """给 FastAPI 应用注入请求监控中间件"""
    from fastapi import FastAPI
    from starlette.middleware.base import BaseHTTPMiddleware

    class MetricsMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            start = time.perf_counter()
            try:
                response = await call_next(request)
                latency_ms = (time.perf_counter() - start) * 1000
                STATS.record_request(
                    request.url.path,
                    request.method,
                    response.status_code,
                    latency_ms,
                )
                # 统计知识库上传
                if "/upload" in request.url.path and request.method == "POST":
                    STATS.record_kb_upload()
                return response
            except Exception as e:
                latency_ms = (time.perf_counter() - start) * 1000
                STATS.record_request(request.url.path, request.method, 500, latency_ms)
                raise

    app.add_middleware(MetricsMiddleware)
    logger.info("[Metrics] 请求监控中间件已注入")


# ─── Prometheus 格式输出 ──────────────────────────────────────
def _prometheus_text() -> str:
    lines = []
    lines.append("# HELP ragf_uptime_seconds 后端已运行秒数")
    lines.append("# TYPE ragf_uptime_seconds gauge")
    lines.append(f"ragf_uptime_seconds {STATS.uptime_seconds()}")

    lines.append("# HELP ragf_request_total API请求总数")
    lines.append("# TYPE ragf_request_total counter")
    for key, count in STATS.request_count.items():
        method, path = key.split(" ", 1)
        safe_path = path.replace("/", "_").replace("-", "_").lstrip("_")
        lines.append(f'ragf_request_total{{method="{method}",path="{path}"}} {count}')

    lines.append("# HELP ragf_request_latency_avg_ms 平均响应时间(ms)")
    lines.append("# TYPE ragf_request_latency_avg_ms gauge")
    for key in STATS.request_count:
        method, path = key.split(" ", 1)
        avg = STATS.avg_latency(key)
        lines.append(f'ragf_request_latency_avg_ms{{method="{method}",path="{path}"}} {avg}')

    lines.append("# HELP ragf_model_calls_total 模型调用次数")
    lines.append("# TYPE ragf_model_calls_total counter")
    for model, count in STATS.model_calls.items():
        lines.append(f'ragf_model_calls_total{{model="{model}"}} {count}')

    lines.append("# HELP ragf_kb_uploads_total 知识库上传文件总数")
    lines.append("# TYPE ragf_kb_uploads_total counter")
    lines.append(f"ragf_kb_uploads_total {STATS.kb_uploads}")

    return "\n".join(lines) + "\n"


# ─── 路由 ─────────────────────────────────────────────────────
@router.get("")
async def get_stats():
    """JSON 格式的当前统计概览"""
    top_endpoints = sorted(
        STATS.request_count.items(), key=lambda x: x[1], reverse=True
    )[:10]
    return {
        "uptime_seconds": STATS.uptime_seconds(),
        "kb_uploads_total": STATS.kb_uploads,
        "model_calls": dict(STATS.model_calls),
        "top_endpoints": [
            {
                "endpoint": k,
                "count": v,
                "avg_latency_ms": STATS.avg_latency(k),
                "p99_latency_ms": STATS.p99_latency(k),
                "errors": STATS.error_count.get(k, 0),
            }
            for k, v in top_endpoints
        ],
    }


@router.get("/echarts")
async def get_echarts_data():
    """
    返回 ECharts 可用的监控面板数据
    包含：请求量折线、响应时间柱状、模型调用饼图
    """
    top_eps = sorted(STATS.request_count.items(), key=lambda x: x[1], reverse=True)[:8]

    return {
        # 请求量排行（横向柱状图）
        "request_bar": {
            "endpoints": [k for k, _ in top_eps],
            "counts":    [v for _, v in top_eps],
            "errors":    [STATS.error_count.get(k, 0) for k, _ in top_eps],
        },
        # 响应时间（avg + p99）
        "latency_bar": {
            "endpoints": [k for k, _ in top_eps],
            "avg_ms":    [STATS.avg_latency(k) for k, _ in top_eps],
            "p99_ms":    [STATS.p99_latency(k) for k, _ in top_eps],
        },
        # 模型调用饼图
        "model_pie": [
            {"name": model, "value": count}
            for model, count in STATS.model_calls.items()
        ],
        # 概览卡片
        "overview": {
            "uptime_h":     round(STATS.uptime_seconds() / 3600, 2),
            "total_reqs":   sum(STATS.request_count.values()),
            "total_errors": sum(STATS.error_count.values()),
            "kb_uploads":   STATS.kb_uploads,
            "models_used":  len(STATS.model_calls),
        },
    }


# Prometheus scrape 端点（放在 /metrics，不加 prefix）
from fastapi import APIRouter as _AR
prometheus_router = _AR()

@prometheus_router.get("/metrics")
async def prometheus_metrics():
    """Prometheus scrape 端点，返回文本格式指标"""
    try:
        # 优先使用 prometheus_client（如果已安装）
        from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
        return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
    except ImportError:
        # 降级：输出自采集的轻量指标
        return Response(content=_prometheus_text(), media_type="text/plain; version=0.0.4")
