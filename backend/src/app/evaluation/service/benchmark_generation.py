"""从 KB chunks 生成评估数据集（RAG 清单 Phase 4 / D61：Yuxi ``benchmark_generation.py`` 迁移）。

**与 Yuxi 的差异**：Yuxi 的生成器带图增强采样（``select_graph_enhanced_chunks`` +
``_chunk_entity_ids``），本项目图谱在 Phase 5，一期只做**纯分块采样**——保留
「分批喂给 LLM → 结构化产出问答对」的主干。

产出的 ``gold_chunk_ids`` **只接受本批真实存在的 chunk_id**：模型偶尔会编造 ID，
而一条虚构的标注会让该题的 P/R/F1 恒为 0，且从评估结果上看不出来是标注坏了还是
检索坏了——这类污染必须在写入前挡掉。
"""

from __future__ import annotations

import asyncio
import json

from typing import TYPE_CHECKING, Any

import json_repair

from sqlalchemy import select

from backend.src.app.kb.model import Chunk
from backend.src.common.log import log

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ['GENERATION_BATCH_SIZE', 'build_generation_prompt', 'generate_items', 'parse_generated_items']

# 单批喂给模型的 chunk 数：太少则模型看不到足够的上下文做改写，太多则产出对不上号
GENERATION_BATCH_SIZE = 5
_MAX_CONTENT_CHARS = 2000


def build_generation_prompt(chunks: list[tuple[str, str]]) -> str:
    """``(chunk_id, content)`` 列表 → 生成提示词（要求逐条给出处 ID）。"""
    blocks = '\n\n'.join(
        f'【片段 {idx}】chunk_id={chunk_id}\n{content[:_MAX_CONTENT_CHARS]}'
        for idx, (chunk_id, content) in enumerate(chunks, start=1)
    )
    return (
        '下面是一篇文档的若干片段。请为每个片段出一个**可被该片段回答**的问题，'
        '并给出答案。问题要具体、可检索（避免"这段讲了什么"这类泛问）。\n\n'
        f'{blocks}\n\n'
        '请只返回 JSON 数组，不要包含其他文本或 Markdown 围栏：\n'
        '[{"chunk_id": "片段对应的 chunk_id", "question": "...", "answer": "..."}]\n'
    )


def parse_generated_items(reply: str, allowed_chunk_ids: list[str]) -> list[dict[str, Any]]:
    """模型回复 → 题目列表；**丢弃引用未知 chunk_id 的条目**（防标注污染）。

    返回 ``[{'query_text', 'gold_chunk_ids', 'gold_answer'}]``；解析失败返回空列表
    （生成是可选能力，失败应记为"这批没产出"，而不是让整次生成崩掉）。
    """
    text = str(reply or '').strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[1] if '\n' in text else ''
        if text.rstrip().endswith('```'):
            text = text.rstrip()[:-3]
    try:
        parsed = json_repair.loads(text.strip())
    except Exception as exc:
        log.warning('数据集生成回复无法解析（本批跳过）: {}', exc)
        return []
    if isinstance(parsed, dict):
        parsed = parsed.get('items') or parsed.get('data') or []
    if not isinstance(parsed, list):
        return []

    allowed = {str(cid) for cid in allowed_chunk_ids}
    items: list[dict[str, Any]] = []
    for raw in parsed:
        if not isinstance(raw, dict):
            continue
        question = str(raw.get('question') or raw.get('query_text') or '').strip()
        chunk_id = str(raw.get('chunk_id') or '').strip()
        answer = str(raw.get('answer') or raw.get('gold_answer') or '').strip()
        if not question or chunk_id not in allowed:
            continue
        items.append({
            'query_text': question,
            'gold_chunk_ids': [chunk_id],
            'gold_answer': answer or None,
        })
    return items


def _batch(chunks: list[tuple[str, str]], size: int) -> list[list[tuple[str, str]]]:
    return [chunks[start : start + size] for start in range(0, len(chunks), size)]


async def _generate_batch(chat_model: Any, batch: list[tuple[str, str]], semaphore: asyncio.Semaphore) -> list[dict]:
    """单批生成（并发受 semaphore 约束；失败只丢这一批）。"""
    async with semaphore:
        try:
            content, _usage = await chat_model.achat([{'role': 'user', 'content': build_generation_prompt(batch)}])
        except Exception as exc:
            log.warning('数据集生成调用失败（本批跳过）: {}', exc)
            return []
    return parse_generated_items(str(content or ''), [cid for cid, _ in batch])


async def generate_items(
    db: AsyncSession,
    *,
    kb_name: str,
    target_count: int,
    sample_size: int,
    chat_model: Any,
    plugin_namespace: str | None = None,
    chunk_loader: Any | None = None,
    concurrency: int = 4,
) -> list[dict[str, Any]]:
    """从 KB 分块采样并生成问答对，返回至多 ``target_count`` 条题目。

    ``chunk_loader`` 可注入（默认取 kb 的分块只读契约），测试据此免依赖数据库。
    """
    loader = chunk_loader or _default_chunk_loader
    chunks = await loader(db, kb_name=kb_name, sample_size=sample_size, plugin_namespace=plugin_namespace)
    if not chunks:
        return []

    semaphore = asyncio.Semaphore(max(int(concurrency), 1))
    batches = await asyncio.gather(
        *(_generate_batch(chat_model, group, semaphore) for group in _batch(chunks, GENERATION_BATCH_SIZE))
    )
    items: list[dict[str, Any]] = []
    for group in batches:
        items.extend(group)
        if len(items) >= target_count:
            break
    return items[:target_count]


async def _default_chunk_loader(
    db: AsyncSession, *, kb_name: str, sample_size: int, plugin_namespace: str | None
) -> list[tuple[str, str]]:
    """默认采样：取该 KB 的前 ``sample_size`` 条内容分块（按序号稳定排序）。

    刻意**排除章节摘要行**（``meta.chunk_type='section_summary'``）：摘要是"文档自己
    的概括"，拿它出题会得到一堆"这篇讲了什么"式的泛问，对检索质量没有区分度。
    """
    from backend.src.app.kb.model.chunk import CHUNK_META_TYPE_KEY, CHUNK_TYPE_SECTION_SUMMARY
    from backend.src.app.kb.utils.namespace import instance_namespace

    ns = instance_namespace(plugin_namespace)
    stmt = (
        select(Chunk)
        .where(
            Chunk.kb_name == kb_name,
            Chunk.plugin_namespace == ns,
            Chunk.meta[CHUNK_META_TYPE_KEY].astext != CHUNK_TYPE_SECTION_SUMMARY,
        )
        .order_by(Chunk.document_id.asc(), Chunk.chunk_index.asc())
        .limit(max(int(sample_size), 1))
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return [(str(row.chunk_id), str(row.content or '')) for row in rows]


def dump_items(items: list[dict[str, Any]]) -> str:
    """题目列表 → JSON（人工可读，便于修订后再写回）。"""
    return json.dumps(items, ensure_ascii=False, indent=2)
