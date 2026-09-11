"""摄取任务指标（ragf-design §14.13：任务终态计数，供域内各任务模块共用）。"""

from __future__ import annotations

from opentelemetry import metrics as otel_metrics

__all__ = ['record_ingest_result']

_INGEST_METER = otel_metrics.get_meter('backend.ragf')
_INGEST_RESULTS = _INGEST_METER.create_counter(
    'ragf.ingest.documents',
    unit='1',
    description='文档摄取终态计数（status=ready/parsing_failed/indexing_failed/failed/dispatched/...）',
)


def record_ingest_result(status: str) -> None:
    """终态/阶段计数。"""
    _INGEST_RESULTS.add(1, {'status': status})
