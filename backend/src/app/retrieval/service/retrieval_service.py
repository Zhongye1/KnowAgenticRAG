"""同步检索编排门面（Yuxi ``knowledge/implementations/milvus.py:aquery`` 重写，
ragf-design §5.7/§7/§14.4/§A.3-A.5）。

编排：KB/参数装配 → embedding 向量化 → 策略化召回（vector/hybrid，服务端 RRF）
→ CrossEncoder 精排（可选，失败按召回序降级 + 结构化日志）→ 来源补全（PG 事实
源 + 文件名）。去 PPR 段（二期）；不出现 Yuxi ``except → return []`` 反模式：
核心能力（embedding/召回）失败直接上抛，精排（可选能力）失败降级。

检索为同步只读路径：方法持有 ``db``（fba ``CurrentSession``），不写库、不派任务。
"""

from __future__ import annotations

import time

from typing import TYPE_CHECKING, Any

from opentelemetry import metrics as otel_metrics
from opentelemetry import trace as otel_trace

from backend.src.app.kb.crud import document_dao, knowledge_base_dao
from backend.src.app.kb.service.chunk_service import ChunkService
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.app.model_provider.service.provider_service import normalize_model_spec, provider_service
from backend.src.app.retrieval.schema.search_result import KBSearchParam
from backend.src.app.retrieval.service.params import (
    build_document_expr,
    merge_search_params,
    resolve_recall_top_k,
)
from backend.src.app.retrieval.service.strategies import RETRIEVE_STRATEGIES
from backend.src.common.exception import errors
from backend.src.common.log import log
from backend.src.core.config import settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from backend.src.app.retrieval.service.ports import ChunkSourcePort

_TRACER = otel_trace.get_tracer('backend.ragf')
_METER = otel_metrics.get_meter('backend.ragf')
# ragf-design §14.13：指标只在域门面/外部依赖边界打点，不侵入纯函数
_RETRIEVAL_REQUESTS = _METER.create_counter(
    'ragf.retrieval.requests', unit='1', description='同步检索请求数（result=ok/degraded/error）'
)
_RETRIEVAL_DURATION = _METER.create_histogram(
    'ragf.retrieval.duration_seconds', unit='s', description='同步检索耗时（含 embedding/召回/精排）'
)
_RERANK_DEGRADED = _METER.create_counter(
    'ragf.retrieval.rerank_degraded', unit='1', description='精排失败降级为召回序的次数（§A.5）'
)


DEFAULT_EMBEDDING_SPEC = 'modelscope:BAAI/bge-m3'
DEFAULT_RERANK_SPEC = 'modelscope:BAAI/bge-reranker-v2-m3'
MAX_FILENAME_MATCH_DOCUMENTS = 500


class PgChunkSource:
    """来源补全适配器（kb 只读契约：chunks + documents，D9）。"""

    @staticmethod
    async def hydrate(
        db: AsyncSession,
        *,
        kb_name: str,
        hits: list[dict[str, Any]],
        plugin_namespace: str | None = None,
    ) -> dict[str, Any]:
        chunk_ids = [hit['chunk_id'] for hit in hits if hit.get('chunk_id')]
        chunks = (
            await ChunkService.list_by_ids(db, chunk_ids, kb_name=kb_name, plugin_namespace=plugin_namespace)
            if chunk_ids
            else []
        )
        document_ids = sorted({hit['document_id'] for hit in hits if hit.get('document_id')})
        documents = (
            await document_dao.list_by_ids(db, document_ids, kb_name=kb_name, plugin_namespace=plugin_namespace)
            if document_ids
            else []
        )
        return {
            'chunks': {chunk.chunk_id: chunk for chunk in chunks},
            'doc_names': {doc.document_id: doc.name for doc in documents},
        }


class RetrievalService:
    """同步检索门面：对外仅 ``search(...)``（§14.4）。"""

    def __init__(self, chunk_source: ChunkSourcePort | None = None) -> None:
        self._chunk_source = chunk_source or PgChunkSource()

    # ------------------------------------------------------------------ 编排
    async def search(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        query_text: str,
        param: KBSearchParam | dict[str, Any] | None = None,
        plugin_namespace: str | None = None,
    ) -> dict[str, Any]:
        """同步检索门面入口（§14.13：span + 指标，不承载编排逻辑）。"""
        started = time.perf_counter()
        with _TRACER.start_as_current_span('ragf.retrieval.search') as span:
            span.set_attribute('ragf.kb_name', kb_name)
            try:
                data = await self._search(
                    db,
                    kb_name=kb_name,
                    query_text=query_text,
                    param=param,
                    plugin_namespace=plugin_namespace,
                )
            except Exception:
                _RETRIEVAL_REQUESTS.add(1, {'result': 'error'})
                raise
            span.set_attribute('ragf.mode', data['mode'])
            span.set_attribute('ragf.recall_count', data['recall_count'])
            span.set_attribute('ragf.reranked', data['reranked'])
            span.set_attribute('ragf.degraded', data['degraded'])
            span.set_attribute('ragf.hit_count', len(data['results']))
            _RETRIEVAL_REQUESTS.add(1, {'result': 'degraded' if data['degraded'] else 'ok'})
            _RETRIEVAL_DURATION.record(time.perf_counter() - started)
            return data

    async def _search(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        query_text: str,
        param: KBSearchParam | dict[str, Any] | None = None,
        plugin_namespace: str | None = None,
    ) -> dict[str, Any]:
        ns = instance_namespace(plugin_namespace)
        kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
        if kb is None:
            raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
        query_text = (query_text or '').strip()
        if not query_text:
            raise errors.RequestError(msg='query_text 不能为空')

        started = time.perf_counter()
        request_data = param.model_dump(exclude_unset=True) if isinstance(param, KBSearchParam) else dict(param or {})
        merged = merge_search_params(kb_query_params=kb.query_params or {}, request=request_data)
        mode = str(merged['search_mode'])
        final_top_k = max(int(merged['final_top_k']), 1)
        use_reranker = bool(merged['use_reranker'])
        recall_top_k = resolve_recall_top_k(
            recall_top_k=merged['recall_top_k'],
            final_top_k=final_top_k,
            use_reranker=use_reranker,
        )

        doc_ids = await self._resolve_document_ids(db, kb_name=kb_name, ns=ns, request=request_data)
        if doc_ids == []:
            return self._output(kb_name=kb_name, mode=mode, started=started)

        # ① embedding（核心能力，失败上抛不伪装成功）
        embed_spec = normalize_model_spec(kb.embedding_model) or DEFAULT_EMBEDDING_SPEC
        embed_client = await provider_service.get_embedding_model(db, embed_spec)
        vectors = await embed_client.aencode([query_text])
        if not vectors:
            raise errors.RequestError(msg=f'Embedding 返回为空 spec={embed_spec}')
        query_embedding = list(vectors[0])
        dim = int(embed_client.dimension) if embed_client.dimension else len(query_embedding)

        # ② 策略化召回（vector/hybrid，纯服务端；RRF 在 Milvus 侧）
        ctx: dict[str, Any] = {
            'kb_name': kb_name,
            'query_text': query_text,
            'query_embedding': query_embedding,
            'dim': dim,
            'recall_top_k': recall_top_k,
            'similarity_threshold': float(merged['similarity_threshold']),
            'expr': build_document_expr(doc_ids),
            'plugin_namespace': ns,
        }
        strategy = RETRIEVE_STRATEGIES.get(mode) or RETRIEVE_STRATEGIES['hybrid']
        recalled = await strategy(ctx)

        # ③ 精排（可选能力，失败降级为召回序，§A.5/§14.9）
        ranked, reranked, degraded = recalled, False, False
        if use_reranker and recalled:
            try:
                rerank_spec = normalize_model_spec(settings.RAGF_RETRIEVAL_RERANK_SPEC) or DEFAULT_RERANK_SPEC
                reranker = await provider_service.get_reranker(db, rerank_spec)
                try:
                    documents = [hit['content'] for hit in recalled]
                    scores = await reranker.acompute_score(query_text, documents, normalize=True)
                    if len(scores) == len(recalled):
                        for hit, score in zip(recalled, scores, strict=True):
                            hit['rerank_score'] = float(score)
                        ranked = sorted(
                            recalled,
                            key=lambda hit: float(hit.get('rerank_score') or hit.get('score') or 0.0),
                            reverse=True,
                        )
                        reranked = True
                finally:
                    await reranker.aclose()
            except Exception as exc:
                degraded = True
                _RERANK_DEGRADED.add(1, {'kb_name': kb_name, 'spec': settings.RAGF_RETRIEVAL_RERANK_SPEC})
                log.warning(
                    '检索精排失败，按召回序降级返回 spec={} kb={} err={}',
                    settings.RAGF_RETRIEVAL_RERANK_SPEC,
                    kb_name,
                    exc,
                )

        # ④ 来源补全 + 组装输出
        final = ranked[:final_top_k]
        source = await self._chunk_source.hydrate(db, kb_name=kb_name, hits=final, plugin_namespace=ns)
        chunk_by_id: dict[str, Any] = source['chunks']
        doc_names: dict[str, str] = source['doc_names']
        results = []
        for hit in final:
            row = chunk_by_id.get(hit.get('chunk_id') or '')
            document_id = str(hit.get('document_id') or (row.document_id if row is not None else ''))
            version_id = int(hit.get('version_id') or (getattr(row, 'version_id', 1) if row is not None else 1))
            chunk_index = int(hit.get('chunk_index') or (getattr(row, 'chunk_index', 0) if row is not None else 0))
            results.append({
                'chunk_id': str(hit.get('chunk_id') or ''),
                'document_id': document_id,
                'kb_name': kb_name,
                'version_id': version_id,
                'chunk_index': chunk_index,
                'content': row.content if row is not None else str(hit.get('content') or ''),
                'metadata': {
                    'source': doc_names.get(document_id) or '未知来源',
                    'score': float(hit.get('score') or 0.0),
                    'rerank_score': hit.get('rerank_score'),
                    'token_count': row.token_count if row is not None else None,
                },
            })
        return self._output(
            kb_name=kb_name,
            mode=mode,
            started=started,
            recall_count=len(recalled),
            reranked=reranked,
            degraded=degraded,
            results=results,
        )

    # ------------------------------------------------------------------ 内部
    async def _resolve_document_ids(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        ns: str,
        request: dict[str, Any],
    ) -> list[str] | None:
        """文件名关键词 → 文档 ID 集；None = 不过滤；[] = 命中为空（短路空结果）。"""
        file_name = str(request.get('file_name') or '').strip()
        if not file_name:
            return None
        stmt = await document_dao.get_select(kb_name=kb_name, plugin_namespace=ns, query=file_name)
        matched = [row.document_id for row in (await db.execute(stmt)).scalars().all()]
        if not matched:
            return []
        if len(matched) > MAX_FILENAME_MATCH_DOCUMENTS:
            raise errors.RequestError(msg=f'文件名过滤命中 {len(matched)} 个文档，请缩小关键词范围')
        return matched

    @staticmethod
    def _output(
        *,
        kb_name: str,
        mode: str,
        started: float,
        recall_count: int = 0,
        reranked: bool = False,
        degraded: bool = False,
        results: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return {
            'kb_name': kb_name,
            'mode': mode,
            'recall_count': recall_count,
            'reranked': reranked,
            'degraded': degraded,
            'duration_ms': int((time.perf_counter() - started) * 1000),
            'results': results or [],
        }


retrieval_service = RetrievalService()

__all__ = ['PgChunkSource', 'RetrievalService', 'retrieval_service']
