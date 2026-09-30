"""摄取完成后的建图派发（RAG 清单 Phase 5 / D62）。

三条设计约束，都是为了让这个钩子**不可能伤害摄取链路**：

1. **默认关闭**（``RAGF_GRAPH_AUTO_BUILD=False``）。开启前应有明确的成本预期——建图会为
   每个分块调一次 LLM。关闭时摄取行为与改造前逐位一致。
2. **按任务名派发，不 import 图谱域**。摄取域只需要知道"有个叫 ``graph.build_document``
   的任务"，不需要知道图谱域长什么样——与它派发 ``knowhere.parse_document`` /
   ``visual.parse_document`` 同一模式。好处是**不新增跨域契约豁免**（`ingest → task`
   本就豁免着）。
3. **任何异常只记日志**。建图是可选增值能力，绝不能因为派发失败而让一次成功的摄取
   变成失败——摄取是用户可见的主链路，建图是它之后的加分项。
"""

from __future__ import annotations

from backend.src.common.log import log
from backend.src.core.config import settings

__all__ = ['enqueue_graph_build']


def enqueue_graph_build(
    *,
    document_id: str,
    kb_name: str,
    plugin_namespace: str | None = None,
) -> None:
    """摄取就绪后派发建图（关闭时直接返回；失败只告警）。"""
    if not settings.RAGF_GRAPH_AUTO_BUILD:
        return
    try:
        from backend.src.app.task.celery import celery_app

        celery_app.send_task(
            'graph.build_document',
            kwargs={
                'document_id': document_id,
                'kb_name': kb_name,
                'plugin_namespace': plugin_namespace,
            },
        )
    except Exception as exc:
        log.warning('建图派发失败（不影响本次摄取）doc={}: {}', document_id, exc)
