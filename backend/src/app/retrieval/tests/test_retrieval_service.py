"""检索服务编排测试（M11：filters 表达式透传、多 KB 聚合、越权负向、active 收敛）。

依赖全部注入替身（kb/文档 dao、embedding/rerank 客户端、策略、来源补全），
无 DB/Milvus/网络；覆盖检索门面编排语义而非第三方调用细节。
"""

from __future__ import annotations

import asyncio

from types import SimpleNamespace
from typing import Any

import pytest

from backend.src.app.kb.service.acl.scope import Scope
from backend.src.app.retrieval.service.retrieval_service import RetrievalService
from backend.src.common.exception import errors


class FakeKb:
    def __init__(self, kb_name: str) -> None:
        self.kb_name = kb_name
        self.query_params: dict[str, Any] = {}
        self.embedding_model = 'bge-m3'


class FakeKbDao:
    def __init__(self, kbs: list[FakeKb]) -> None:
        self.kbs = {kb.kb_name: kb for kb in kbs}

    async def get(self, db: Any, kb_name: str, *, plugin_namespace: str | None = None) -> FakeKb | None:
        return self.kbs.get(kb_name)


class FakeDocDao:
    """resolve_searchable_document_ids：按 kb_name + tag/keyword/file_type 返回预设文档集。"""

    def __init__(self, scopes: dict[str, list[str]]) -> None:
        self.scopes = scopes
        self.calls: list[dict[str, Any]] = []

    async def resolve_searchable_document_ids(self, db: Any, **kwargs: Any) -> list[str] | None:
        self.calls.append(kwargs)
        if not any(kwargs.get(key) for key in ('file_name', 'keyword', 'tag', 'file_type', 'path_prefix')):
            return None
        return self.scopes.get(kwargs['kb_name'])


class FakeEmbedding:
    model = 'bge-m3'
    dimension = 3

    def __init__(self) -> None:
        self.batches: list[list[str]] = []

    async def aencode(self, texts: list[str] | str) -> list[list[float]]:
        items = [texts] if isinstance(texts, str) else list(texts)
        self.batches.append(items)
        return [[0.1, 0.2, 0.3] for _ in items]


class FakeReranker:
    def __init__(self) -> None:
        self.calls = 0
        self.queries: list[str] = []

    async def acompute_score(
        self, query: str, documents: list[str], *, normalize: bool = True, batch_size: int | None = None
    ) -> list[float]:
        self.calls += 1
        self.queries.append(query)
        # 分数随序递增：排序后末位文档排最前，便于断言重排生效
        return [float(index + 1) for index in range(len(documents))]

    async def aclose(self) -> None:
        pass


class FakeProvider:
    def __init__(self, reranker: FakeReranker | None = None) -> None:
        self.reranker = reranker or FakeReranker()
        self.embedding = FakeEmbedding()

    async def get_embedding_model(self, db: Any, spec: str) -> FakeEmbedding:
        return self.embedding

    async def get_reranker(self, db: Any, spec: str) -> FakeReranker:
        return self.reranker


class FakeChunkSource:
    def __init__(self, active: dict[str, int] | None = None) -> None:
        self.active = active or {}

    async def hydrate(
        self, db: Any, *, kb_name: str, hits: list[dict[str, Any]], plugin_namespace: str | None = None
    ) -> dict[str, Any]:
        rows: dict[str, Any] = {}
        names: dict[str, str] = {}
        active: dict[str, int] = {}
        for hit in hits:
            chunk_id = str(hit.get('chunk_id') or '')
            document_id = str(hit.get('document_id') or '')
            rows[chunk_id] = SimpleNamespace(
                chunk_id=chunk_id,
                document_id=document_id,
                version_id=int(hit.get('version_id') or 1),
                chunk_index=int(hit.get('chunk_index') or 0),
                content=str(hit.get('content') or ''),
                token_count=10,
            )
            names[document_id] = f'doc-{document_id}.md'
            if document_id not in active:
                active[document_id] = self.active.get(document_id, int(hit.get('version_id') or 1))
        return {'chunks': rows, 'doc_names': names, 'active_versions': active}


def _hit(document_id: str, kb_name: str, version_id: int = 1, chunk_index: int = 0) -> dict[str, Any]:
    return {
        'chunk_id': f'{document_id}:{version_id}:{chunk_index}',
        'document_id': document_id,
        'kb_name': kb_name,
        'version_id': version_id,
        'chunk_index': chunk_index,
        'content': f'{kb_name}/{document_id} v{version_id} 内容',
        'score': 0.5,
    }


class FakeStrategies:
    def __init__(self) -> None:
        self.ctxs: list[dict[str, Any]] = []

    def build(self) -> dict[str, Any]:
        async def strategy(ctx: dict[str, Any]) -> list[dict[str, Any]]:  # ruff: ignore[unused-async]
            self.ctxs.append(dict(ctx))
            kb_name = ctx['kb_name']
            return [h for h in _ALL_HITS if h['kb_name'] == kb_name]

        return {'hybrid': strategy, 'vector': strategy}


_ALL_HITS: list[dict[str, Any]] = [
    _hit('doc-a', 'dev', version_id=2, chunk_index=0),
    _hit('doc-a', 'dev', version_id=1, chunk_index=0),  # 旧版本（active=2 时应收敛）
    _hit('doc-b', 'ops', version_id=1, chunk_index=0),
]


def _service(
    *,
    kbs: list[FakeKb] | None = None,
    scopes: dict[str, list[str]] | None = None,
    active: dict[str, int] | None = None,
    provider: FakeProvider | None = None,
    use_reranker_request: bool | None = None,
) -> tuple[RetrievalService, FakeStrategies, FakeDocDao]:
    strategies = FakeStrategies()
    doc_dao = FakeDocDao(scopes or {})
    request: dict[str, Any] = {'use_reranker': False}
    if use_reranker_request is not None:
        request['use_reranker'] = use_reranker_request
    service = RetrievalService(
        chunk_source=FakeChunkSource(active or {}),
        kb_dao=FakeKbDao(kbs or [FakeKb('dev'), FakeKb('ops')]),
        doc_dao=doc_dao,
        provider=provider or FakeProvider(),
        strategies=strategies.build(),
    )
    return service, strategies, doc_dao


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


def test_single_search_basic_shape() -> None:
    service, strategies, _ = _service()
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='版本差异',
            param={'use_reranker': False},
        )
    )
    assert data['kb_name'] == 'dev'
    assert data['kb_names'] == ['dev']
    assert data['hit_count'] == 1  # doc-a v2 保留、v1 被 active 收敛丢弃
    assert data['results'][0]['chunk_id'] == 'doc-a:2:0'
    assert data['results'][0]['kb_name'] == 'dev'
    assert strategies.ctxs[0]['expr'] is None


def test_multi_query_recall_batches_embeddings_and_reranks_once() -> None:
    """D41：多子查询一次批量编码、逐路召回（ctx 带 query_texts），精排只跑一次。

    精排判据仍用调用方给的**原始问题**——子查询是召回表述，用户原问才是相关性判据。
    """
    provider = FakeProvider()
    service, strategies, _ = _service(provider=provider)
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='原始问题',
            query_texts=['甲', '乙'],
            param={'use_reranker': True},
        )
    )
    assert provider.embedding.batches == [['甲', '乙']]
    assert strategies.ctxs[0]['query_texts'] == ['甲', '乙']
    assert len(strategies.ctxs[0]['query_embeddings']) == 2
    assert strategies.ctxs[0]['query_text'] == '甲'  # 单查询字段保留，存量策略兼容
    assert provider.reranker.calls == 1
    assert provider.reranker.queries == ['原始问题']
    assert data['query_texts'] == ['甲', '乙']


def test_single_query_ctx_is_backward_compatible() -> None:
    """不传 query_texts 时 ctx 仍带单查询字段，且输出与既有行为一致。"""
    service, strategies, _ = _service()
    data = _run(
        service.search(None, kb_name='dev', query_text='版本差异', param={'use_reranker': False})  # type: ignore[arg-type]
    )
    assert strategies.ctxs[0]['query_text'] == '版本差异'
    assert strategies.ctxs[0]['query_embedding'] == [0.1, 0.2, 0.3]
    assert strategies.ctxs[0]['query_texts'] == ['版本差异']
    assert data['query_texts'] == ['版本差异']
    assert data['results'][0]['chunk_id'] == 'doc-a:2:0'


def test_tag_filter_resolves_doc_ids_and_expr() -> None:
    service, strategies, doc_dao = _service(scopes={'dev': ['doc-a']})
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='兼容性',
            param={'use_reranker': False, 'filters': {'tag': '升级'}},
        )
    )
    assert data['hit_count'] == 1
    assert doc_dao.calls[0]['tag'] == '升级'
    assert strategies.ctxs[0]['expr'] == 'document_id == "doc-a"'


def test_version_filter_applies_milvus_expr() -> None:
    service, strategies, _ = _service()
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='v2',
            param={'use_reranker': False, 'filters': {'version_id': 2}},
        )
    )
    # 显式 version_id 请求：不做 active 收敛，两个版本都返回
    assert strategies.ctxs[0]['expr'] == 'version_id == 2'
    assert data['hit_count'] == 2


def test_doc_filter_empty_short_circuits() -> None:
    service, strategies, _ = _service(scopes={'dev': []})
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='x',
            param={'use_reranker': False, 'filters': {'tag': '没有'}},
        )
    )
    assert data['results'] == []
    assert strategies.ctxs == []


def test_search_multi_aggregates_and_keeps_attribution() -> None:
    service, strategies, _ = _service()
    data = _run(
        service.search_multi(
            None,  # type: ignore[arg-type]
            kb_names=['dev', 'ops'],
            query_text='版本差异',
            param={'use_reranker': False},
        )
    )
    assert data['kb_names'] == ['dev', 'ops']
    assert {hit['kb_name'] for hit in data['results']} == {'dev', 'ops'}
    assert data['hit_count'] == 2  # dev doc-a v2（v1 被 active 收敛）+ ops doc-b
    assert strategies.ctxs[0]['expr'] is None


def test_search_multi_final_top_k_unified() -> None:
    service, _, _ = _service()
    data = _run(
        service.search_multi(
            None,  # type: ignore[arg-type]
            kb_names=['dev', 'ops'],
            query_text='x',
            param={'use_reranker': False, 'final_top_k': 1},
        )
    )
    assert data['hit_count'] == 1


def test_search_multi_rerank_sorts_by_rerank_score() -> None:
    provider = FakeProvider()
    service, _, _ = _service(provider=provider)
    # doc-b（ops 最后）得分最高 → 重排后第一位
    data = _run(
        service.search_multi(
            None,  # type: ignore[arg-type]
            kb_names=['dev', 'ops'],
            query_text='x',
            param={'use_reranker': True, 'final_top_k': 3},
        )
    )
    assert data['reranked'] is True
    assert data['results'][0]['document_id'] == 'doc-b'
    assert provider.reranker.calls == 1


def test_multi_unknown_kb_idor_raises_not_found() -> None:
    service, _, _ = _service(kbs=[FakeKb('dev')])
    with pytest.raises(errors.NotFoundError):
        _run(
            service.search_multi(
                None,  # type: ignore[arg-type]
                kb_names=['dev', 'secret'],
                query_text='x',
            )
        )


def test_multi_empty_or_too_many_kbs_rejected() -> None:
    service, _, _ = _service()
    with pytest.raises(errors.RequestError):
        _run(
            service.search_multi(
                None,  # type: ignore[arg-type]
                kb_names=[],
                query_text='x',
            )
        )
    with pytest.raises(errors.RequestError):
        _run(
            service.search_multi(
                None,  # type: ignore[arg-type]
                kb_names=[f'kb{i}' for i in range(21)],
                query_text='x',
            )
        )


# ---------------------------------------------------------------------------
# 视觉召回（ragf_visual，spec D7 查询侧）
# ---------------------------------------------------------------------------


class FakeVisualEncoder:
    def __init__(self, *, exc: Exception | None = None) -> None:
        self.exc = exc
        self.texts: list[str] = []

    def embed_text(self, text: str) -> list[float]:
        self.texts.append(text)
        if self.exc is not None:
            raise self.exc
        return [0.4, 0.5, 0.6]


class FakeVisualProvider(FakeProvider):
    def __init__(self, encoder: FakeVisualEncoder | None = None) -> None:
        super().__init__()
        self.encoder = encoder or FakeVisualEncoder()

    def get_visual_encoder(self) -> FakeVisualEncoder:
        return self.encoder


class FakeVisualStrategy:
    def __init__(self, hits: list[dict[str, Any]] | None = None, exc: Exception | None = None) -> None:
        self.hits = hits or []
        self.exc = exc
        self.ctxs: list[dict[str, Any]] = []

    async def __call__(self, ctx: dict[str, Any]) -> list[dict[str, Any]]:
        self.ctxs.append(dict(ctx))
        if self.exc is not None:
            raise self.exc
        return [dict(hit) for hit in self.hits]


def _visual_hit(document_id: str, kb_name: str, score: float) -> dict[str, Any]:
    return {
        'id': f'{document_id}_t0',
        'image_path': f'kb/core/{kb_name}/{document_id}/tiles/{document_id}_t0.jpg',
        'document_id': document_id,
        'page': 3,
        'position': 'strip_0',
        'chunk_type': 'tile',
        'parent_section': '',
        'content_summary': '',
        'score': score,
    }


def _visual_service(
    *,
    provider: FakeVisualProvider | None = None,
    visual: FakeVisualStrategy | None = None,
    scopes: dict[str, list[str]] | None = None,
) -> tuple[RetrievalService, FakeStrategies, FakeVisualStrategy]:
    strategies = FakeStrategies()
    visual_strategy = visual or FakeVisualStrategy()
    service = RetrievalService(
        chunk_source=FakeChunkSource(),
        kb_dao=FakeKbDao([FakeKb('dev'), FakeKb('ops')]),
        doc_dao=FakeDocDao(scopes or {}),
        provider=provider or FakeVisualProvider(),
        strategies=strategies.build(),
        visual_strategy=visual_strategy,
    )
    return service, strategies, visual_strategy


def test_visual_recall_disabled_by_default() -> None:
    service, strategies, visual = _visual_service()
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='x',
            param={'use_reranker': False},
        )
    )
    assert visual.ctxs == []
    assert data['visual_results'] == []
    assert data['visual_degraded'] is False
    assert strategies.ctxs  # 文本召回正常


def test_visual_recall_enabled_returns_sorted_visual_results() -> None:
    visual = FakeVisualStrategy([_visual_hit('doc-a', 'dev', 0.8), _visual_hit('doc-b', 'dev', 0.9)])
    provider = FakeVisualProvider()
    service, _, _ = _visual_service(provider=provider, visual=visual)
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='架构图',
            param={'use_reranker': False, 'include_visual': True, 'visual_top_k': 1},
        )
    )
    assert provider.encoder.texts == ['架构图']  # 整次查询编码一次
    assert len(visual.ctxs) == 1
    assert visual.ctxs[0]['query_visual_embedding'] == [0.4, 0.5, 0.6]
    assert visual.ctxs[0]['visual_top_k'] == 1
    assert [hit['id'] for hit in data['visual_results']] == ['doc-b_t0']  # 全局降序 + 截断
    assert data['visual_results'][0]['kb_name'] == 'dev'
    assert data['visual_degraded'] is False


def test_visual_recall_multi_kb_keeps_attribution_and_sort() -> None:
    visual = FakeVisualStrategy([_visual_hit('doc-a', 'dev', 0.7), _visual_hit('doc-b', 'ops', 0.95)])
    service, _, _ = _visual_service(visual=visual)
    data = _run(
        service.search_multi(
            None,  # type: ignore[arg-type]
            kb_names=['dev', 'ops'],
            query_text='x',
            param={'use_reranker': False, 'include_visual': True},
        )
    )
    assert len(visual.ctxs) == 2  # 逐库召回
    assert {hit['kb_name'] for hit in data['visual_results']} == {'dev', 'ops'}
    assert data['visual_results'][0]['document_id'] == 'doc-b'  # 跨库按分数降序


def test_visual_encode_failure_degrades_without_blocking_text() -> None:
    provider = FakeVisualProvider(encoder=FakeVisualEncoder(exc=RuntimeError('dashscope down')))
    service, _, visual = _visual_service(provider=provider)
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='x',
            param={'use_reranker': False, 'include_visual': True},
        )
    )
    assert data['visual_degraded'] is True
    assert data['visual_results'] == []
    assert data['hit_count'] == 1  # 文本结果不受影响
    assert visual.ctxs == []


def test_visual_recall_failure_degrades_without_blocking_text() -> None:
    visual = FakeVisualStrategy(exc=RuntimeError('milvus visual down'))
    service, _, _ = _visual_service(visual=visual)
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='x',
            param={'use_reranker': False, 'include_visual': True},
        )
    )
    assert data['visual_degraded'] is True
    assert data['hit_count'] == 1
    assert visual.ctxs  # 召回被调用过（失败在策略内）


def test_visual_expr_doc_filter_and_scope_without_version() -> None:
    visual = FakeVisualStrategy([_visual_hit('doc-a', 'dev', 0.9)])
    service, _, _ = _visual_service(visual=visual, scopes={'dev': ['doc-a']})
    scope = Scope(namespace='core', user_id='u1', groups=['1'], allowed_kbs=['dev'])
    _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='x',
            param={'use_reranker': False, 'include_visual': True, 'filters': {'version_id': 2, 'tag': '升级'}},
            scope=scope,
        )
    )
    expr = visual.ctxs[0]['expr']
    assert 'document_id == "doc-a"' in expr  # 文档级过滤解析后下推
    assert 'namespace == "core"' in expr  # scope ACL 同构下推
    assert 'version_id' not in expr  # 视觉行无版本标量，不做版本过滤


# ---------------------------------------------------------------------------
# document_ids 直推(RAG 查询面)与 steps 轨迹
# ---------------------------------------------------------------------------


def test_document_ids_direct_filter_skips_pg_resolution() -> None:
    service, strategies, doc_dao = _service()
    data = _run(
        service.search_multi(
            None,  # type: ignore[arg-type]
            kb_names=['dev'],
            query_text='x',
            param={'use_reranker': False, 'document_ids': ['doc-a', 'doc-b']},
        )
    )
    assert doc_dao.calls == []  # 直推不查 PG
    assert strategies.ctxs[0]['expr'] == 'document_id in ["doc-a", "doc-b"]'
    assert data['hit_count'] == 1


def test_document_ids_empty_short_circuits() -> None:
    service, strategies, _ = _service()
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='x',
            param={'use_reranker': False, 'document_ids': []},
        )
    )
    assert data['results'] == []
    assert data['visual_results'] == []
    assert strategies.ctxs == []


def test_document_ids_dedup_and_blank_dropped() -> None:
    service, strategies, doc_dao = _service()
    _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='x',
            param={'use_reranker': False, 'document_ids': ['doc-a', ' ', 'doc-a']},
        )
    )
    assert strategies.ctxs[0]['expr'] == 'document_id == "doc-a"'
    assert doc_dao.calls == []


def test_output_carries_steps_trajectory() -> None:
    service, _, _ = _service()
    data = _run(
        service.search(
            None,  # type: ignore[arg-type]
            kb_name='dev',
            query_text='x',
            param={'use_reranker': False},
        )
    )
    assert [step['name'] for step in data['steps']] == ['recall', 'rerank', 'hydrate']
    assert data['steps'][1]['detail'] == 'skipped'  # use_reranker=False
    assert data['include_visual'] is False


# ---------------------------------------------------------------------------
# 流式检索供源(SSE,阶段2)
# ---------------------------------------------------------------------------


def test_astream_search_emits_steps_then_result() -> None:
    service, _, _ = _service()

    async def _collect() -> list[tuple[str, dict[str, Any]]]:
        events = []
        async for kind, payload in service.astream_search(
            None,  # type: ignore[arg-type]
            kb_names=['dev'],
            query_text='x',
            param={'use_reranker': False},
        ):
            events.append((kind, payload))
        return events

    events = asyncio.run(_collect())
    assert [kind for kind, _ in events] == ['step', 'step', 'step', 'result']
    assert [payload['name'] for kind, payload in events if kind == 'step'] == ['recall', 'rerank', 'hydrate']
    result = events[-1][1]
    assert result['hit_count'] == 1
    assert [step['name'] for step in result['steps']] == ['recall', 'rerank', 'hydrate']


def test_astream_search_semantic_error_propagates() -> None:
    service, _, _ = _service(kbs=[FakeKb('dev')])

    async def _collect() -> None:
        async for _ in service.astream_search(
            None,  # type: ignore[arg-type]
            kb_names=['secret'],
            query_text='x',
        ):
            pass

    with pytest.raises(errors.NotFoundError):
        asyncio.run(_collect())
