"""图谱服务：子图抽取 + 写入编排（RAG 清单 Phase 5 / D62）。

**这是替代 Neo4j 的核心模块**。Yuxi 的子图遍历在 Cypher 里做，这里用逐跳 BFS 在 SQL 上
做——语义（"从种子实体出发扩展 N 跳"）等价，代价是每跳一次往返而不是图库的原地遍历。
所以设了**硬上限**（跳数、三元组数、实体数）：图检索是召回的一部分，不能让它把一次
查询拖成分钟级。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.app.graph.crud import graph_dao
from backend.src.app.graph.service.graph_utils import (
    build_graph_payload,
    compute_entity_id,
    compute_triple_id,
    normalize_entity_name,
)
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['MAX_HOPS', 'build_subgraph', 'write_chunk_graph']

# 扩展跳数上限：2 跳已能覆盖"同现 + 中介实体"的常见证据形态，再深收益递减而代价线性增长
MAX_HOPS = 2


async def build_subgraph(
    db: AsyncSession,
    *,
    kb_name: str,
    seed_entity_ids: list[str],
    hops: int = MAX_HOPS,
    plugin_namespace: str | None = None,
    max_entities: int | None = None,
) -> dict[str, Any]:
    """从种子实体出发逐跳扩展，返回 PPR 需要的 ``{'nodes', 'edges'}``。

    节点含两类：命中的**实体**节点（带 ``entity_id``，PPR 的种子落在这里）与它们被
    提及的 **Chunk** 节点（带 ``chunk_id``，PPR 的输出来自这里）。
    """
    from backend.src.app.graph.crud.crud_graph import MAX_SUBGRAPH_ENTITIES, MAX_SUBGRAPH_TRIPLES

    limit_entities = int(max_entities or MAX_SUBGRAPH_ENTITIES)
    visited: set[str] = {str(item) for item in seed_entity_ids if item}
    frontier = sorted(visited)
    triples: list[Any] = []
    seen_triples: set[str] = set()

    for _ in range(max(int(hops), 0)):
        if not frontier:
            break
        rows = await graph_dao.expand_triples(
            db,
            kb_name=kb_name,
            frontier=frontier,
            plugin_namespace=plugin_namespace,
            limit=MAX_SUBGRAPH_TRIPLES,
        )
        next_frontier: list[str] = []
        for row in rows:
            if row.triple_id not in seen_triples:
                seen_triples.add(row.triple_id)
                triples.append(row)
            for entity_id in (row.source_entity_id, row.target_entity_id):
                if entity_id not in visited:
                    visited.add(entity_id)
                    next_frontier.append(entity_id)
                    if len(visited) >= limit_entities:
                        break
            if len(visited) >= limit_entities:
                break
        frontier = next_frontier

    if not visited:
        return {'nodes': [], 'edges': []}

    entity_rows = await graph_dao.list_entities(db, sorted(visited), kb_name=kb_name, plugin_namespace=plugin_namespace)
    mention_rows = await graph_dao.list_mentions(
        db, sorted(visited), kb_name=kb_name, plugin_namespace=plugin_namespace
    )

    nodes: list[dict[str, Any]] = [
        {
            'id': f'entity:{row.entity_id}',
            'type': 'Entity',
            'properties': {'entity_id': row.entity_id, 'name': row.name, 'label': row.label},
        }
        for row in entity_rows
    ]
    # Chunk 节点按 chunk_id 去重：一个 chunk 提及多个实体时只应出现一次
    chunk_ids = sorted({row.chunk_id for row in mention_rows})
    nodes.extend(
        {'id': f'chunk:{chunk_id}', 'type': 'Chunk', 'properties': {'chunk_id': chunk_id}} for chunk_id in chunk_ids
    )
    # 提及边（Chunk ↔ Entity）：PPR 靠它把实体的种子质量传导到 chunk
    edges: list[dict[str, str]] = [
        {'source_id': f'chunk:{row.chunk_id}', 'target_id': f'entity:{row.entity_id}'} for row in mention_rows
    ]
    edges.extend(
        {'source_id': f'entity:{row.source_entity_id}', 'target_id': f'entity:{row.target_entity_id}'}
        for row in triples
    )
    return {'nodes': nodes, 'edges': edges}


async def write_chunk_graph(
    db: AsyncSession,
    *,
    kb_name: str,
    document_id: str,
    chunk_id: str,
    normalized_result: dict[str, Any],
    extractor_type: str = 'llm',
    plugin_namespace: str | None = None,
) -> dict[str, int]:
    """把一块文本的抽取结果写进图谱，返回各类计数。

    实体与三元组的 ID 由内容派生，因此**重复抽取同一块是幂等的**（upsert 冲突即更新）。
    """
    from backend.src.app.kb.utils.namespace import instance_namespace

    ns = instance_namespace(plugin_namespace)
    payload = build_graph_payload(normalized_result)
    local_to_entity_id: dict[str, str] = {}
    entity_rows: list[dict[str, Any]] = []
    for entity in payload['entities']:
        normalized_name = normalize_entity_name(entity['text'])
        entity_id = compute_entity_id(ns, kb_name, normalized_name, entity['label'])
        local_to_entity_id[entity['id']] = entity_id
        entity_rows.append({
            'entity_id': entity_id,
            'normalized_name': normalized_name,
            'name': entity['text'],
            'label': entity['label'],
            'attributes': entity['attributes'],
        })

    triple_rows: list[dict[str, Any]] = []
    for relation in payload['relations']:
        source_id = local_to_entity_id[relation['source_id']]
        target_id = local_to_entity_id[relation['target_id']]
        triple_rows.append({
            'triple_id': compute_triple_id(ns, kb_name, source_id, relation['label'], target_id),
            'source_entity_id': source_id,
            'target_entity_id': target_id,
            'relation_type': relation['label'],
            'text': relation['text'],
            'extractor_type': extractor_type,
        })

    mention_rows = [
        {
            'mention_id': f'{chunk_id}:{entity_id}',
            'chunk_id': chunk_id,
            'document_id': document_id,
            'entity_id': entity_id,
        }
        for entity_id in sorted(set(local_to_entity_id.values()))
    ]

    await graph_dao.upsert_entities(db, kb_name=kb_name, entities=entity_rows, plugin_namespace=plugin_namespace)
    await graph_dao.upsert_triples(db, kb_name=kb_name, triples=triple_rows, plugin_namespace=plugin_namespace)
    await graph_dao.upsert_mentions(db, kb_name=kb_name, mentions=mention_rows, plugin_namespace=plugin_namespace)
    log.debug('图谱写入 kb={} chunk={} 实体={} 三元组={}', kb_name, chunk_id, len(entity_rows), len(triple_rows))
    return {'entities': len(entity_rows), 'triples': len(triple_rows), 'mentions': len(mention_rows)}
