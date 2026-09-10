"""同步检索编排门面（Yuxi ``knowledge/implementations/milvus.py:aquery`` 重写，
ragf-design §5.7/§7/§14.4/§A.3-A.5；agent-layer spec §5.3/D26/D27/M11 扩展）。

编排：KB/参数装配 → embedding 向量化 → 策略化召回（vector/hybrid，服务端 RRF，
支持单 KB 与多 KB 聚合，M11）→ CrossEncoder 精排（可选，失败按召回序降级 + 结
构化日志）→ 结构化过滤（文档级条件解析为 document_id 集 + 精确 version_id）→
来源补全（PG 事实源 + 文件名 + active_version 收敛）。去 PPR 段（二期）；不出现
Yuxi ``except → return []`` 反模式：核心能力（embedding/召回）失败直接上抛，精排
（可选能力）失败降级。

检索为同步只读路径：方法持有 ``db``（fba ``CurrentSession``），不写库、不派任务。
多 KB 场景：各 KB 归属/越权逐库校验（防工具版 IDOR，D33/M11），聚合后统一精排
与 ``final_top_k``，结果保留 ``kb_name`` 归属。
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
from backend.src.app.retrieval.service.filters import (
    MAX_DOC_FILTER_MATCH,
    coerce_filters,
    compose_retrieval_expr,
    filter_active_versions,
)
from backend.src.app.retrieval.service.params import merge_search_params, resolve_recall_top_k
from backend.src.app.retrieval.service.scope import Scope, to_milvus_expr
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


# 查询侧兜底默认（与 KB 摄取侧默认一致，千问平台 token，防止两侧向量空间错配）
DEFAULT_EMBEDDING_SPEC = 'dashscope:qwen3.7-text-embedding-flash'
DEFAULT_RERANK_SPEC = 'dashscope:qwen3.7-text-rerank'
MAX_KB_NAMES = 20  # M11：单次跨 KB 聚合上限
MAX_RERANK_CANDIDATES = 300  # 精排候选上限（防御多 KB × 大 recall 的越界成本）


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
            'active_versions': {doc.document_id: int(getattr(doc, 'active_version', 1) or 1) for doc in documents},
        }


class RetrievalService:
    """同步检索门面：对外 ``search(...)``（单 KB）与 ``search_multi(...)``（M11 多 KB 聚合）。"""

    def __init__(
        self,
        chunk_source: ChunkSourcePort | None = None,
        *,
        kb_dao: Any | None = None,
        doc_dao: Any | None = None,
        provider: Any | None = None,
        strategies: dict[str, Any] | None = None,
    ) -> None:
        self._chunk_source = chunk_source or PgChunkSource()
        self._kb_dao = kb_dao or knowledge_base_dao
        self._doc_dao = doc_dao or document_dao
        self._provider = provider or provider_service
        self._strategies = dict(strategies or RETRIEVE_STRATEGIES)

    # ------------------------------------------------------------------ 门面
    async def search(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        query_text: str,
        param: KBSearchParam | dict[str, Any] | None = None,
        plugin_namespace: str | None = None,
        scope: Scope | None = None,
    ) -> dict[str, Any]:
        """同步检索门面入口（单 KB；§14.13：span + 指标，不承载编排逻辑）。

        scope: 检索范围（ACL 过滤），由 build_retrieval_scope() 构建。
               如果提供，会在 Milvus 召回时注入权限过滤表达式。
        """
        started = time.perf_counter()
        with _TRACER.start_as_current_span('ragf.retrieval.search') as span:
            span.set_attribute('ragf.kb_name', kb_name)
            if scope:
                span.set_attribute('ragf.scope.user_id', scope.user_id)
                span.set_attribute('ragf.scope.groups', len(scope.groups))
            try:
                data = await self._aggregate(
                    db,
                    kb_names=[kb_name],
                    query_text=query_text,
                    param=param,
                    plugin_namespace=plugin_namespace,
                    scope=scope,
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

    async def search_multi(
        self,
        db: AsyncSession,
        *,
        kb_names: list[str],
        query_text: str,
        param: KBSearchParam | dict[str, Any] | None = None,
        plugin_namespace: str | None = None,
        scope: Scope | None = None,
    ) -> dict[str, Any]:
        """多 KB 聚合检索门面（M11/D27：跨库召回 → 合并 → 统一精排/final_top_k）。

        scope: 检索范围（ACL 过滤），由 build_retrieval_scope() 构建。
               如果提供，会在 Milvus 召回时注入权限过滤表达式。
        """
        started = time.perf_counter()
        label = ','.join(kb_names or [])
        with _TRACER.start_as_current_span('ragf.retrieval.search_multi') as span:
            span.set_attribute('ragf.kb_names', label)
            if scope:
                span.set_attribute('ragf.scope.user_id', scope.user_id)
                span.set_attribute('ragf.scope.groups', len(scope.groups))
            try:
                data = await self._aggregate(
                    db,
                    kb_names=kb_names,
                    query_text=query_text,
                    param=param,
                    plugin_namespace=plugin_namespace,
                    scope=scope,
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

    # ------------------------------------------------------------------ 编排
    async def _aggregate(
        self,
        db: AsyncSession,
        *,
        kb_names: list[str],
        query_text: str,
        param: KBSearchParam | dict[str, Any] | None = None,
        plugin_namespace: str | None = None,
        scope: Scope | None = None,
    ) -> dict[str, Any]:
        ns = instance_namespace(plugin_namespace)
        names = self._normalize_kb_names(kb_names)
        query_text = (query_text or '').strip()
        if not query_text:
            raise errors.RequestError(msg='query_text 不能为空')

        # ① KB 归属校验（多 KB 逐库校验：跨 KB 越权不可见，D33/M11）
        # 如果有 scope，使用 scope.allowed_kbs 校验；否则使用现有逻辑
        if scope is not None:
            # scope 校验：请求的 KB 必须在 allowed_kbs 内
            denied = set(names) - set(scope.allowed_kbs)
            if denied:
                raise errors.ForbiddenError(msg=f'无权访问以下知识库: {sorted(denied)}')
            kbs = await self._load_kbs(db, names=names, ns=ns)
        else:
            kbs = await self._load_kbs(db, names=names, ns=ns)

        started = time.perf_counter()
        merged = self._merged_params(kbs[names[0]], param)
        mode = str(merged['search_mode'])
        final_top_k = max(int(merged['final_top_k']), 1)
        use_reranker = bool(merged['use_reranker'])
        recall_top_k = resolve_recall_top_k(
            recall_top_k=merged['recall_top_k'],
            final_top_k=final_top_k,
            use_reranker=use_reranker,
        )
        request_data = self._request_data(param)
        filters, version_id = self._filters_from(request_data)

        # ② embedding（核心能力，失败上抛不伪装成功；按 embedding 模型分组复用）
        embed_groups = await self._load_embeddings(db, kbs=kbs, names=names, query_text=query_text)

        # ③ 文档级过滤解析 + 逐 KB 召回（带 scope 过滤）
        merged_hits = await self._recall_kbs(
            db,
            names=names,
            kbs=kbs,
            ns=ns,
            query_text=query_text,
            mode=mode,
            recall_top_k=recall_top_k,
            threshold=float(merged['similarity_threshold']),
            version_id=version_id,
            request_data=request_data,
            embed_groups=embed_groups,
            scope=scope,
        )

        # ④ 精排（可选能力，失败降级为召回序，§A.5/§14.9）
        ranked, reranked, degraded = await self._rank_hits(
            db,
            kb_label=names[0],
            query_text=query_text,
            hits=merged_hits,
            use_reranker=use_reranker,
        )

        # ⑤ 来源补全 + active_version 收敛 + 统一 final_top_k 组装
        results = await self._build_results(
            db,
            ns=ns,
            final=ranked[:final_top_k],
            fallback_kb=names[0],
            version_requested=bool(filters is not None and filters.version_id is not None),
        )
        return self._output(
            kb_names=names,
            mode=mode,
            started=started,
            recall_count=len(merged_hits),
            reranked=reranked,
            degraded=degraded,
            results=results,
        )

    # ------------------------------------------------------------------ 编排步骤
    async def _load_kbs(self, db: AsyncSession, *, names: list[str], ns: str) -> dict[str, Any]:
        """逐库加载并校验归属（None = 不存在/跨租户不可见 → NotFoundError）。"""
        kbs: dict[str, Any] = {}
        for kb_name in names:
            kb = await self._kb_dao.get(db, kb_name, plugin_namespace=ns)
            if kb is None:
                raise errors.NotFoundError(msg=f'知识库不存在: {kb_name}')
            kbs[kb_name] = kb
        return kbs

    async def _load_embeddings(
        self,
        db: AsyncSession,
        *,
        kbs: dict[str, Any],
        names: list[str],
        query_text: str,
    ) -> dict[str, dict[str, Any]]:
        """按 embedding 模型分组编码（每组一次调用；返回 spec → 向量/维度）。"""
        groups: dict[str, dict[str, Any]] = {}
        for kb_name in names:
            spec = normalize_model_spec(kbs[kb_name].embedding_model) or DEFAULT_EMBEDDING_SPEC
            groups.setdefault(spec, {'spec': spec, 'kb_names': []})['kb_names'].append(kb_name)
        for group in groups.values():
            embed_client = await self._provider.get_embedding_model(db, group['spec'])
            vectors = await embed_client.aencode([query_text])
            if not vectors:
                raise errors.RequestError(msg=f'Embedding 返回为空 spec={group["spec"]}')
            group['query_embedding'] = list(vectors[0])
            group['dim'] = int(embed_client.dimension) if embed_client.dimension else len(group['query_embedding'])
        return groups

    async def _recall_kbs(
        self,
        db: AsyncSession,
        *,
        names: list[str],
        kbs: dict[str, Any],
        ns: str,
        query_text: str,
        mode: str,
        recall_top_k: int,
        threshold: float,
        version_id: int | None,
        request_data: dict[str, Any],
        embed_groups: dict[str, dict[str, Any]],
        scope: Scope | None = None,
    ) -> list[dict[str, Any]]:
        """逐 KB 文档过滤解析 + 策略化召回；结果打上 kb_name 归属。

        scope: 检索范围（ACL 过滤），用于生成 Milvus 过滤表达式。
        """
        merged: list[dict[str, Any]] = []
        for kb_name in names:
            doc_ids = await self._resolve_doc_ids(db, kb_name=kb_name, ns=ns, request_data=request_data)
            if doc_ids == []:
                continue

            # 构建 Milvus 过滤表达式：组合 doc_ids 过滤 + scope 过滤
            expr = compose_retrieval_expr(doc_ids=doc_ids, version_id=version_id)

            # 如果有 scope，追加 scope 过滤
            if scope is not None:
                scope_expr = to_milvus_expr(scope)
                # 组合：doc_ids 过滤 AND scope 过滤
                expr = f'({expr}) and ({scope_expr})' if expr else scope_expr

            group = next(item for item in embed_groups.values() if kb_name in item['kb_names'])
            ctx: dict[str, Any] = {
                'kb_name': kb_name,
                'query_text': query_text,
                'query_embedding': group['query_embedding'],
                'dim': group['dim'],
                'recall_top_k': recall_top_k,
                'similarity_threshold': threshold,
                'expr': expr,
                'plugin_namespace': ns,
            }
            strategy = self._strategies.get(mode) or self._strategies['hybrid']
            for hit in await strategy(ctx):
                hit['kb_name'] = kb_name
                merged.append(hit)
        return merged

    async def _rank_hits(
        self,
        db: AsyncSession,
        *,
        kb_label: str,
        query_text: str,
        hits: list[dict[str, Any]],
        use_reranker: bool,
    ) -> tuple[list[dict[str, Any]], bool, bool]:
        """可选精排：失败/超限降级为召回序（reranked=False, degraded=True）。"""
        if not use_reranker or not hits:
            return hits, False, False
        candidates = hits[:MAX_RERANK_CANDIDATES]
        if len(hits) > MAX_RERANK_CANDIDATES:
            log.warning('多 KB 精排候选超限，截断到 {} 条', MAX_RERANK_CANDIDATES)
        try:
            rerank_spec = normalize_model_spec(settings.RAGF_RETRIEVAL_RERANK_SPEC) or DEFAULT_RERANK_SPEC
            reranker = await self._provider.get_reranker(db, rerank_spec)
            try:
                documents = [hit['content'] for hit in candidates]
                scores = await reranker.acompute_score(query_text, documents, normalize=True)
                if len(scores) == len(candidates):
                    for hit, score in zip(candidates, scores, strict=True):
                        hit['rerank_score'] = float(score)
                    ranked = sorted(
                        candidates,
                        key=lambda hit: float(hit.get('rerank_score') or hit.get('score') or 0.0),
                        reverse=True,
                    )
                    return ranked, True, False
            finally:
                await reranker.aclose()
        except Exception as exc:
            _RERANK_DEGRADED.add(1, {'kb_name': kb_label, 'spec': settings.RAGF_RETRIEVAL_RERANK_SPEC})
            log.warning(
                '检索精排失败，按召回序降级返回 spec={} kb={} err={}',
                settings.RAGF_RETRIEVAL_RERANK_SPEC,
                kb_label,
                exc,
            )
        return hits, False, True

    async def _build_results(
        self,
        db: AsyncSession,
        *,
        ns: str,
        final: list[dict[str, Any]],
        fallback_kb: str,
        version_requested: bool,
    ) -> list[dict[str, Any]]:
        """来源补全 + active_version 收敛 + 命中条目组装。"""
        source = await self._hydrate_multi(db, hits=final, plugin_namespace=ns)
        kept = filter_active_versions(final, source['active_versions'], version_requested=version_requested)
        results = []
        for hit in kept:
            kb_name = str(hit.get('kb_name') or fallback_kb)
            row = source['chunks'].get(str(hit.get('chunk_id') or ''))
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
                    'source': source['doc_names'].get(document_id) or '未知来源',
                    'score': float(hit.get('score') or 0.0),
                    'rerank_score': hit.get('rerank_score'),
                    'token_count': row.token_count if row is not None else None,
                },
            })
        return results

    async def _hydrate_multi(
        self,
        db: AsyncSession,
        *,
        hits: list[dict[str, Any]],
        plugin_namespace: str | None,
    ) -> dict[str, Any]:
        """跨 KB 来源补全（chunks/doc_names/active_versions 合并映射）。"""
        by_kb: dict[str, list[dict[str, Any]]] = {}
        for hit in hits:
            by_kb.setdefault(str(hit.get('kb_name') or ''), []).append(hit)
        chunks: dict[str, Any] = {}
        doc_names: dict[str, str] = {}
        active_versions: dict[str, int] = {}
        for kb_name, group_hits in by_kb.items():
            source = await self._chunk_source.hydrate(
                db, kb_name=kb_name, hits=group_hits, plugin_namespace=plugin_namespace
            )
            chunks.update(source.get('chunks') or {})
            doc_names.update(source.get('doc_names') or {})
            active_versions.update(source.get('active_versions') or {})
        return {'chunks': chunks, 'doc_names': doc_names, 'active_versions': active_versions}

    async def _resolve_doc_ids(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        ns: str,
        request_data: dict[str, Any],
    ) -> list[str] | None:
        """文档级过滤（file_name 兼容 + filters）→ document_id 集；None=不过滤。"""
        file_name = str(request_data.get('file_name') or '').strip() or None
        filters = self._filters_from(request_data)[0]
        if file_name is None and filters is None:
            return None
        matched = await self._doc_dao.resolve_searchable_document_ids(
            db,
            kb_name=kb_name,
            plugin_namespace=ns,
            file_name=file_name,
            keyword=filters.keyword if filters is not None else None,
            tag=filters.tag if filters is not None else None,
            updated_after=filters.updated_after if filters is not None else None,
            updated_before=filters.updated_before if filters is not None else None,
            file_type=filters.file_type if filters is not None else None,
            path_prefix=filters.path_prefix if filters is not None else None,
        )
        if matched is None or len(matched) <= MAX_DOC_FILTER_MATCH:
            return matched
        raise errors.RequestError(msg=f'过滤命中 {len(matched)} 个文档，请缩小关键词/过滤范围')

    # ------------------------------------------------------------------ 纯辅助
    @staticmethod
    def _request_data(param: KBSearchParam | dict[str, Any] | None) -> dict[str, Any]:
        return param.model_dump(exclude_unset=True) if isinstance(param, KBSearchParam) else dict(param or {})

    @staticmethod
    def _filters_from(request_data: dict[str, Any]) -> tuple[Any, int | None]:
        """request_data → (RetrievalFilters|None, version_id|None)；非法值抛 RequestError。"""
        raw = request_data.get('filters')
        if raw is None:
            return None, None
        try:
            filters = coerce_filters(raw)
        except (TypeError, ValueError) as exc:
            raise errors.RequestError(msg=str(exc)) from exc
        if filters is None:
            return None, None
        return filters, filters.version_id

    @staticmethod
    def _merged_params(kb: Any, param: KBSearchParam | dict[str, Any] | None) -> dict[str, Any]:
        request_data = param.model_dump(exclude_unset=True) if isinstance(param, KBSearchParam) else dict(param or {})
        return merge_search_params(kb_query_params=kb.query_params or {}, request=request_data)

    @staticmethod
    def _normalize_kb_names(kb_names: list[str] | None) -> list[str]:
        """去空/去重；空或超限抛 RequestError（M11）。"""
        names: list[str] = []
        for item in kb_names or []:
            text = str(item or '').strip()
            if not text:
                continue
            if text not in names:
                names.append(text)
        if not names:
            raise errors.RequestError(msg='kb_names 不能为空')
        if len(names) > MAX_KB_NAMES:
            raise errors.RequestError(msg=f'kb_names 最多支持 {MAX_KB_NAMES} 个')
        return names

    @staticmethod
    def _output(
        *,
        kb_names: list[str],
        mode: str,
        started: float,
        recall_count: int = 0,
        reranked: bool = False,
        degraded: bool = False,
        results: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        results = results or []
        return {
            'kb_name': kb_names[0],
            'kb_names': kb_names,
            'mode': mode,
            'recall_count': recall_count,
            'hit_count': len(results),
            'reranked': reranked,
            'degraded': degraded,
            'duration_ms': int((time.perf_counter() - started) * 1000),
            'results': results,
        }


retrieval_service = RetrievalService()

__all__ = ['PgChunkSource', 'RetrievalService', 'retrieval_service']
