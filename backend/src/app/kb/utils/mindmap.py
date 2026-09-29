"""知识导图聚合（kb-落地改造清单 Phase 4 / 4.2）。

**不新增存储**：导图由已在库的 `documents.structure`（Knowhere `doc_nav` 章节树，
形状见 `ingest/service/knowhere_mapping.build_doc_structure`）聚合成以文档为根的
森林。Yuxi 为此单开了 `mindmap` / `mindmap_file_ids` / `mindmap_metadata` 三列 +
生成任务 + diff 接口，本项目的解析产物已经够用，不需要那套。

聚合是**纯函数**（无 DB/IO），单测直覆盖；空 `structure` 时降级为「只有文档名的
平铺列表」，而不是返回空树——对使用者来说「这个库有哪些文档」本身就是最小可用的
知识地图。
"""

from __future__ import annotations

from typing import Any

__all__ = ['MAX_MINDMAP_NODES', 'build_mindmap']

# 导图节点总数上限：知识地图是给人看的，超过这个量级不如用文档列表
MAX_MINDMAP_NODES = 500

DocumentRow = dict[str, Any]


def _structure_nodes(nodes: list[Any], budget: dict[str, int]) -> list[dict[str, Any]]:
    """把某文档的 structure 递归转成导图节点（受全局预算约束）。"""
    out: list[dict[str, Any]] = []
    for node in nodes:
        if budget['n'] <= 0:
            break
        if not isinstance(node, dict):
            continue
        budget['n'] -= 1
        children = node.get('children')
        out.append({
            'title': str(node.get('title') or node.get('path') or '').strip(),
            'path': str(node.get('path') or ''),
            'level': int(node.get('level') or 1),
            'summary': str(node.get('summary') or ''),
            'chunk_count': int(node.get('chunk_count') or 0),
            'children': _structure_nodes(children, budget) if isinstance(children, list) else [],
        })
    return out


def build_mindmap(documents: list[DocumentRow], *, max_nodes: int = MAX_MINDMAP_NODES) -> list[dict[str, Any]]:
    """文档列表 → 知识导图森林。

    每个文档**必定产出一个根节点**；根节点下挂该文档的章节树（来自
    `documents.structure`）。`structure` 为空（未摄取 / 非 Knowhere 管线 / 解析无章节）
    时该文档只有根节点，整体自然退化为平铺文档列表。

    **预算只约束章节展开，不约束根节点**：`max_nodes` 是章节节点配额，耗尽后其余文档
    只给根节点。反过来做（预算耗尽就跳出循环）会让一篇超大文档把后面所有文档挤掉，
    知识地图上直接看不到它们——而「有这篇文档」比「某篇文档的深层章节」更该保住。
    根节点数量由知识库真实文档数决定，不会失控。
    """
    budget = {'n': max(0, int(max_nodes))}
    forest: list[dict[str, Any]] = []
    for doc in documents:
        structure = doc.get('structure')
        root: dict[str, Any] = {
            'title': str(doc.get('name') or doc.get('document_id') or ''),
            'path': '',
            'level': 0,
            'document_id': str(doc.get('document_id') or ''),
            'status': str(doc.get('status') or ''),
            'chunk_count': int(doc.get('chunk_count') or 0),
            'children': [],
        }
        if isinstance(structure, list) and structure:
            root['children'] = _structure_nodes(structure, budget)
        forest.append(root)
    return forest
