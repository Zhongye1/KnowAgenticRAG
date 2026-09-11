"""RAG 查询响应适配器(EagleRAG 对齐,纯函数,无 IO)。

把 `RetrievalService` 输出 dict 映射为 `RagSearchOutput` 载荷:`results/visual_results`
→ `sources{text, image}` 二元来源,`include_visual/mode` → `route`(selector 诚实
标注 explicit),`steps` 原样透传。单测直覆盖。
"""

from __future__ import annotations

from typing import Any

from backend.src.app.retrieval.schema.rag_query import to_image_source

__all__ = ['build_rag_payload']


def build_rag_payload(data: dict[str, Any]) -> dict[str, Any]:
    """service 输出 → RagSearchOutput 载荷。"""
    text_sources = [
        {
            'type': 'text',
            'chunk_id': str(hit.get('chunk_id') or ''),
            'document_id': str(hit.get('document_id') or ''),
            'kb_name': str(hit.get('kb_name') or ''),
            'version_id': int(hit.get('version_id') or 1),
            'chunk_index': int(hit.get('chunk_index') or 0),
            'file_name': str((hit.get('metadata') or {}).get('source') or ''),
            'content': str(hit.get('content') or ''),
            'score': float((hit.get('metadata') or {}).get('score') or hit.get('score') or 0.0),
            'rerank_score': (hit.get('metadata') or {}).get('rerank_score'),
            'token_count': (hit.get('metadata') or {}).get('token_count'),
        }
        for hit in data.get('results') or []
    ]
    image_sources = [to_image_source(item) for item in data.get('visual_results') or []]
    include_visual = bool(data.get('include_visual'))
    selected = ['text'] + (['visual'] if include_visual else [])
    return {
        'kb_names': list(data.get('kb_names') or []),
        'mode': str(data.get('mode') or 'hybrid'),
        'route': {
            'mode': str(data.get('mode') or 'hybrid'),
            'selected': selected,
            'reason': 'explicit params',
            'kb_names': list(data.get('kb_names') or []),
        },
        'steps': list(data.get('steps') or []),
        'recall_count': int(data.get('recall_count') or 0),
        'reranked': bool(data.get('reranked')),
        'degraded': bool(data.get('degraded')),
        'visual_degraded': bool(data.get('visual_degraded')),
        'duration_ms': int(data.get('duration_ms') or 0),
        'sources': {'text': text_sources, 'image': image_sources},
    }
