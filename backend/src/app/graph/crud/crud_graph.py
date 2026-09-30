"""图谱读写（RAG 清单 Phase 5 / D62）。

**替代 Yuxi 的 Cypher 部分**：Yuxi 的子图遍历、邻居查询、删除都走 Neo4j；本项目用
``graph_triples`` 两端的索引在 SQL 里做逐跳 BFS。这是 D62「不引 Neo4j」能否成立的
核心——遍历语义靠索引路径等价实现，而不是靠图数据库。

写入一律 **upsert（冲突即更新）**：实体/三元组 ID 内容派生，重复抽取同一文本会得到
同样的 ID，插入应幂等而不是报唯一约束冲突。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from backend.src.app.graph.model import GraphDocumentIndex, GraphEntity, GraphMention, GraphTriple
from backend.src.app.kb.crud.base import TenantScopedCrud, result_rowcount
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.utils.timezone import timezone

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['CRUDGraph', 'graph_dao']

# 子图扩展的硬上限：图检索是**召回的一部分**，不能让它把一次查询拖成分钟级
MAX_SUBGRAPH_TRIPLES = 4000
MAX_SUBGRAPH_ENTITIES = 800


class CRUDGraph(TenantScopedCrud[GraphEntity]):
    """实体 / 三元组 / 提及 / 建图台账的统一读写入口。

    四张表放一个 DAO 而非四个：它们总是**一起用**（写图要同时写实体+三元组+提及，
    删文档图谱要同时删三者），拆开后每个方法都要跨 DAO 调用，反而更难看清一次操作的
    完整副作用。
    """

    # ------------------------------------------------------------------ 写入
    async def upsert_entities(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        entities: list[dict[str, Any]],
        plugin_namespace: str | None = None,
    ) -> int:
        """批量 upsert 实体（按 ID 冲突即更新属性），返回写入行数。"""
        if not entities:
            return 0
        ns = instance_namespace(plugin_namespace)
        rows = [
            {
                'entity_id': entity['entity_id'],
                'plugin_namespace': ns,
                'kb_name': kb_name,
                'normalized_name': entity['normalized_name'],
                'name': entity['name'],
                'label': entity['label'],
                'attributes': list(entity.get('attributes') or []),
            }
            for entity in entities
        ]
        stmt = pg_insert(GraphEntity).values(rows)
        # 冲突时只更新"会变的字段"：名称/标签是身份的一部分，不会变
        stmt = stmt.on_conflict_do_update(
            index_elements=[GraphEntity.entity_id],
            set_={
                'attributes': stmt.excluded.attributes,
                'updated_time': timezone.now(),
            },
        )
        await db.execute(stmt)
        await db.flush()
        return len(rows)

    async def upsert_triples(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        triples: list[dict[str, Any]],
        plugin_namespace: str | None = None,
    ) -> int:
        if not triples:
            return 0
        ns = instance_namespace(plugin_namespace)
        rows = [
            {
                'triple_id': triple['triple_id'],
                'plugin_namespace': ns,
                'kb_name': kb_name,
                'source_entity_id': triple['source_entity_id'],
                'target_entity_id': triple['target_entity_id'],
                'relation_type': triple['relation_type'],
                'text': triple.get('text') or '',
                'extractor_type': triple.get('extractor_type') or '',
            }
            for triple in triples
        ]
        stmt = pg_insert(GraphTriple).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=[GraphTriple.triple_id],
            set_={'text': stmt.excluded.text, 'relation_type': stmt.excluded.relation_type},
        )
        await db.execute(stmt)
        await db.flush()
        return len(rows)

    async def upsert_mentions(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        mentions: list[dict[str, Any]],
        plugin_namespace: str | None = None,
    ) -> int:
        """写入提及（chunk → 实体）；冲突即忽略（提及是幂等事实，无字段可更新）。"""
        if not mentions:
            return 0
        ns = instance_namespace(plugin_namespace)
        rows = [
            {
                'mention_id': mention['mention_id'],
                'plugin_namespace': ns,
                'kb_name': kb_name,
                'chunk_id': mention['chunk_id'],
                'document_id': mention['document_id'],
                'entity_id': mention['entity_id'],
            }
            for mention in mentions
        ]
        stmt = pg_insert(GraphMention).values(rows).on_conflict_do_nothing(index_elements=[GraphMention.mention_id])
        await db.execute(stmt)
        await db.flush()
        return len(rows)

    async def upsert_document_index(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        kb_name: str,
        version_id: int,
        chunk_count: int,
        entity_count: int,
        triple_count: int,
        status: str = 'indexed',
        error_message: str | None = None,
        plugin_namespace: str | None = None,
    ) -> None:
        """回填建图台账（自愈比对基准）。"""
        ns = instance_namespace(plugin_namespace)
        stmt = pg_insert(GraphDocumentIndex).values({
            'document_id': document_id,
            'plugin_namespace': ns,
            'kb_name': kb_name,
            'version_id': version_id,
            'chunk_count': chunk_count,
            'entity_count': entity_count,
            'triple_count': triple_count,
            'status': status,
            'error_message': error_message,
        })
        stmt = stmt.on_conflict_do_update(
            index_elements=[GraphDocumentIndex.document_id],
            set_={
                'version_id': stmt.excluded.version_id,
                'chunk_count': stmt.excluded.chunk_count,
                'entity_count': stmt.excluded.entity_count,
                'triple_count': stmt.excluded.triple_count,
                'status': stmt.excluded.status,
                'error_message': stmt.excluded.error_message,
                'indexed_time': timezone.now(),
            },
        )
        await db.execute(stmt)
        await db.flush()

    # ------------------------------------------------------------------ 读取（子图展开）
    async def expand_triples(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        frontier: list[str],
        plugin_namespace: str | None = None,
        limit: int = MAX_SUBGRAPH_TRIPLES,
    ) -> list[GraphTriple]:
        """取与 frontier 中任一实体相连的三元组（**一跳**）。

        两端 ``IN`` 的 OR 查询命中 ``idx_graph_triples_source`` / ``idx_graph_triples_target``
        两个索引——这是"不引 Neo4j"的替代路径：图数据库的邻居遍历在这里等价为两条
        索引扫描。
        """
        ids = sorted({str(item) for item in frontier if item})
        if not ids:
            return []
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(GraphTriple)
            .where(
                GraphTriple.plugin_namespace == ns,
                GraphTriple.kb_name == kb_name,
                (GraphTriple.source_entity_id.in_(ids)) | (GraphTriple.target_entity_id.in_(ids)),
            )
            .limit(max(int(limit), 1))
        )
        return list((await db.execute(stmt)).scalars().all())

    async def list_entities(
        self,
        db: AsyncSession,
        entity_ids: list[str],
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> list[GraphEntity]:
        ids = sorted({str(item) for item in entity_ids if item})
        if not ids:
            return []
        ns = instance_namespace(plugin_namespace)
        stmt = select(GraphEntity).where(GraphEntity.plugin_namespace == ns, GraphEntity.entity_id.in_(ids))
        if kb_name is not None:
            stmt = stmt.where(GraphEntity.kb_name == kb_name)
        return list((await db.execute(stmt)).scalars().all())

    async def search_entities_by_name(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        normalized_names: list[str],
        plugin_namespace: str | None = None,
    ) -> list[GraphEntity]:
        """按**归一名称**精确匹配实体（查询侧的种子定位）。

        用归一名称而非模糊匹配：查询文本里的实体在切词后往往已归一，模糊匹配会把
        "apple" 匹配到 "applesauce"，给种子引入噪声——而 PPR 对种子质量很敏感。
        """
        names = sorted({str(item) for item in normalized_names if item})
        if not names:
            return []
        ns = instance_namespace(plugin_namespace)
        stmt = select(GraphEntity).where(
            GraphEntity.plugin_namespace == ns,
            GraphEntity.kb_name == kb_name,
            GraphEntity.normalized_name.in_(names),
        )
        return list((await db.execute(stmt)).scalars().all())

    async def search_entities_in_text(
        self,
        db: AsyncSession,
        *,
        kb_name: str,
        normalized_text: str,
        plugin_namespace: str | None = None,
        limit: int = 20,
    ) -> list[GraphEntity]:
        """实体**归一名称是给定文本的子串**（查询侧种子定位）。

        方向是「实体名出现在查询里」而非反向：后者会把 ``apple`` 匹配到 ``pineapple``，
        给 PPR 引入噪声种子。

        调用方须先保证 ``normalized_text`` 非空——``strpos(x, '')`` 恒为 1，会把全部
        实体当种子（等于关掉个性化）。
        """
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(GraphEntity)
            .where(
                GraphEntity.plugin_namespace == ns,
                GraphEntity.kb_name == kb_name,
                func.strpos(normalized_text, GraphEntity.normalized_name) > 0,
            )
            .limit(max(int(limit), 1))
        )
        return list((await db.execute(stmt)).scalars().all())

    async def list_mentions(
        self,
        db: AsyncSession,
        entity_ids: list[str],
        *,
        kb_name: str,
        plugin_namespace: str | None = None,
        limit: int = 2000,
    ) -> list[GraphMention]:
        ids = sorted({str(item) for item in entity_ids if item})
        if not ids:
            return []
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(GraphMention)
            .where(
                GraphMention.plugin_namespace == ns,
                GraphMention.kb_name == kb_name,
                GraphMention.entity_id.in_(ids),
            )
            .limit(max(int(limit), 1))
        )
        return list((await db.execute(stmt)).scalars().all())

    # ------------------------------------------------------------------ 删除与统计
    async def delete_document_graph(
        self,
        db: AsyncSession,
        *,
        document_id: str,
        plugin_namespace: str | None = None,
    ) -> dict[str, int]:
        """删除文档的提及与台账。

        **不删实体与三元组**：它们跨文档共享——同一实体在多篇文档里出现只存一行，
        按文档删掉会让其它文档的图谱缺节点。孤儿实体（不再被任何提及引用）由对账
        任务回收，与「删除要精确、回收可粗放」的一般口径一致。
        """
        ns = instance_namespace(plugin_namespace)
        mentions = await db.execute(
            delete(GraphMention).where(GraphMention.plugin_namespace == ns, GraphMention.document_id == document_id)
        )
        index_rows = await db.execute(
            delete(GraphDocumentIndex).where(
                GraphDocumentIndex.plugin_namespace == ns, GraphDocumentIndex.document_id == document_id
            )
        )
        await db.flush()
        return {'mentions': result_rowcount(mentions), 'index_rows': result_rowcount(index_rows)}

    async def delete_kb_graph(
        self, db: AsyncSession, kb_name: str, *, plugin_namespace: str | None = None
    ) -> dict[str, int]:
        """删除整个 KB 的图谱（四张表全清）。"""
        ns = instance_namespace(plugin_namespace)
        counts: dict[str, int] = {}
        for label, model in (
            ('mentions', GraphMention),
            ('triples', GraphTriple),
            ('entities', GraphEntity),
            ('index_rows', GraphDocumentIndex),
        ):
            result = await db.execute(delete(model).where(model.plugin_namespace == ns, model.kb_name == kb_name))
            counts[label] = result_rowcount(result)
        await db.flush()
        return counts

    async def stats(self, db: AsyncSession, kb_name: str, *, plugin_namespace: str | None = None) -> dict[str, int]:
        ns = instance_namespace(plugin_namespace)
        counts: dict[str, int] = {}
        for label, model in (
            ('entities', GraphEntity),
            ('triples', GraphTriple),
            ('mentions', GraphMention),
            ('documents', GraphDocumentIndex),
        ):
            counts[label] = int(
                (
                    await db.scalar(
                        select(func.count())
                        .select_from(model)
                        .where(model.plugin_namespace == ns, model.kb_name == kb_name)
                    )
                )
                or 0
            )
        return counts


graph_dao = CRUDGraph(GraphEntity)
