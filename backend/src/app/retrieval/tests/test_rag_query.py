"""RAG 查询面测试(适配器纯函数 + images 回源端点,无 DB/Milvus/网络)。"""

from __future__ import annotations

import asyncio

from typing import Any, cast

import pytest

from backend.src.app.kb.service.acl.resolver import Perm
from backend.src.app.kb.service.acl.scope import UserContext
from backend.src.app.retrieval.api.v1 import rag_query
from backend.src.app.retrieval.service.rag_adapter import build_rag_payload
from backend.src.common.exception import errors


def _service_output() -> dict:
    return {
        'kb_name': 'dev',
        'kb_names': ['dev', 'ops'],
        'mode': 'hybrid',
        'recall_count': 3,
        'hit_count': 1,
        'reranked': True,
        'degraded': False,
        'duration_ms': 12,
        'results': [
            {
                'chunk_id': 'doc-a:2:0',
                'document_id': 'doc-a',
                'kb_name': 'dev',
                'version_id': 2,
                'chunk_index': 0,
                'content': '正文',
                'metadata': {'source': 'doc-a.md', 'score': 0.42, 'rerank_score': 0.91, 'token_count': 64},
            }
        ],
        'visual_results': [
            {
                'id': 'doc-a_t3',
                'image_path': 'kb/core/dev/doc-a/tiles/doc-a_t3.jpg',
                'document_id': 'doc-a',
                'kb_name': 'dev',
                'page': 3,
                'position': 'strip_3',
                'chunk_type': 'tile',
                'parent_section': '',
                'content_summary': '',
                'score': 0.87,
            }
        ],
        'visual_degraded': False,
        'include_visual': True,
        'steps': [{'name': 'recall', 'detail': 'text=3 visual=1 recall_top_k=20'}],
    }


def test_build_rag_payload_maps_sources_route_steps() -> None:
    payload = build_rag_payload(_service_output())
    assert payload['kb_names'] == ['dev', 'ops']
    assert payload['route']['selected'] == ['text', 'visual']
    assert payload['route']['reason'] == 'explicit params'
    assert payload['steps'] == [{'name': 'recall', 'detail': 'text=3 visual=1 recall_top_k=20'}]
    text = payload['sources']['text'][0]
    assert text['chunk_id'] == 'doc-a:2:0'
    assert text['file_name'] == 'doc-a.md'
    assert text['score'] == pytest.approx(0.42)
    assert text['rerank_score'] == pytest.approx(0.91)
    image = payload['sources']['image'][0]
    assert image['type'] == 'image'
    assert image['image_id'] == 'doc-a_t3'
    assert image['score'] == pytest.approx(0.87)


def test_build_rag_payload_text_only_selection() -> None:
    data = _service_output()
    data['include_visual'] = False
    data['visual_results'] = []
    payload = build_rag_payload(data)
    assert payload['route']['selected'] == ['text']
    assert payload['sources']['image'] == []


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


def test_get_rag_image_url_signs_object_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        rag_query,
        'get_visual_image_ref',
        lambda image_id, *, plugin_namespace=None: {
            'document_id': 'doca',
            'kb_name': 'dev',
            'image_path': 'kb/core/dev/doca/tiles/doca_t0.jpg',
        },
    )

    class _FakeDoc:
        kb_name = 'dev'

    class FakeDocDao:
        async def get(self, db: Any, document_id: str, *, kb_name: Any = None, plugin_namespace: Any = None) -> Any:
            return _FakeDoc()

    monkeypatch.setattr(rag_query, 'document_dao', FakeDocDao())
    monkeypatch.setattr(rag_query, 'get_document_url', lambda key, expires=3600: f'http://signed/{key}')

    async def _allow(*_a: Any, **_k: Any) -> Any:
        await asyncio.sleep(0)
        return Perm.READ

    monkeypatch.setattr(rag_query, 'resolve_kb_perm', _allow)
    user = UserContext(user_id='u1', namespace='core')
    result = _run(rag_query.get_rag_image_url(cast('Any', None), 'core', 'doca_t0', user))
    data = result.data
    assert data.image_id == 'doca_t0'
    assert data.document_id == 'doca'
    assert data.kb_name == 'dev'
    assert data.url == 'http://signed/kb/core/dev/doca/tiles/doca_t0.jpg'
    assert data.expires_in_seconds == 3600


def test_get_rag_image_url_unknown_image_404(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rag_query, 'get_visual_image_ref', lambda image_id, *, plugin_namespace=None: None)
    with pytest.raises(errors.NotFoundError):
        _run(
            rag_query.get_rag_image_url(
                cast('Any', None), 'core', 'missing_t0', UserContext(user_id='u1', namespace='core')
            )
        )


def test_get_rag_image_url_missing_document_404(monkeypatch: pytest.MonkeyPatch) -> None:
    """视觉行存在但 PG 文档缺失(跨库对象键伪造/文档已删)→ 404。"""
    monkeypatch.setattr(
        rag_query,
        'get_visual_image_ref',
        lambda image_id, *, plugin_namespace=None: {
            'document_id': 'ghost',
            'kb_name': 'dev',
            'image_path': 'kb/core/dev/ghost/tiles/ghost_t0.jpg',
        },
    )

    class FakeDocDao:
        async def get(self, db: Any, document_id: str, *, kb_name: Any = None, plugin_namespace: Any = None) -> None:
            return None

    monkeypatch.setattr(rag_query, 'document_dao', FakeDocDao())
    with pytest.raises(errors.NotFoundError):
        _run(
            rag_query.get_rag_image_url(
                cast('Any', None), 'core', 'ghost_t0', UserContext(user_id='u1', namespace='core')
            )
        )
