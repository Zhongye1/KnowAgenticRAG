"""检索召回缓存（D63）：key-versioning 取代显式失效。

只缓存**召回命中**（跳过 embedding 编码 + Milvus 召回），精排与来源补全照跑。
因此缓存载荷是纯 ``list[dict]``，无需序列化引用与章节正文。

缓存键刻意不引入 user_id，而是纳入**生效的 Milvus 表达式**（``to_milvus_expr``
输出，含 ``owner_id == user_id`` 与 ``groups`` 主体集）与 KB 内容信号：

- ACL 变更 → 表达式变 → 键变，旧条目自然不再命中，无需跨进程广播失效；
- 内容变更 → 内容信号变 → 键变；
- 陈旧上界 = TTL，与 ``RAGF_RETRIEVAL_CACHE_TTL_SECONDS`` 一致。

缓存是**可选能力**：默认关闭（``RAGF_RETRIEVAL_CACHE_ENABLED``，opt-in），且读写
异常一律降级为「未命中 / 不写入」并告警，不影响检索本身。
"""

from __future__ import annotations

import hashlib
import json

from typing import Any

from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.redis import redis_client

__all__ = ['CACHE_KEY_PREFIX', 'build_recall_cache_key', 'get_cached_recall', 'store_recall']

CACHE_KEY_PREFIX = 'ragf:retrieval:recall'


def build_recall_cache_key(
    *,
    namespace: str,
    query_texts: list[str],
    kb_exprs: list[tuple[str, str | None]],
    content_signals: list[tuple[str, str]],
    params: dict[str, Any],
) -> str:
    """构造召回缓存键。

    ``kb_exprs`` 为 ``(kb_name, 生效 Milvus 表达式)``；``content_signals`` 为
    ``(kb_name, 内容信号)``；``params`` 是影响召回结果的检索参数子集。全部参与
    摘要，任一变化都会换键。
    """
    payload = {
        'ns': namespace,
        # 归一化只做去首尾空白：大小写与内部分词交给 Milvus 的 analyzer，不在这里猜
        'queries': [str(text).strip() for text in query_texts],
        'kbs': sorted([str(kb_name), str(expr)] for kb_name, expr in kb_exprs),
        'content': sorted([str(kb_name), str(signal)] for kb_name, signal in content_signals),
        'params': {str(key): params[key] for key in sorted(params)},
    }
    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    digest = hashlib.sha256(blob.encode('utf-8')).hexdigest()
    return f'{CACHE_KEY_PREFIX}:{digest}'


async def get_cached_recall(key: str) -> list[dict[str, Any]] | None:
    """读召回缓存；未命中或读失败返回 None（调用方按未命中继续）。"""
    try:
        raw = await redis_client.get(key)
    except Exception as exc:
        log.warning('检索缓存读取失败，按未命中处理: {}', exc)
        return None
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except ValueError:
        log.warning('检索缓存内容不是合法 JSON，按未命中处理 key={}', key)
        return None
    hits = payload.get('hits') if isinstance(payload, dict) else None
    return [dict(hit) for hit in hits] if isinstance(hits, list) else None


async def store_recall(key: str, hits: list[dict[str, Any]]) -> None:
    """写召回缓存；写失败只告警（缓存是可选能力，不阻塞检索）。"""
    ttl = max(int(settings.RAGF_RETRIEVAL_CACHE_TTL_SECONDS), 1)
    try:
        await redis_client.set(key, json.dumps({'hits': hits}, ensure_ascii=False), ex=ttl)
    except Exception as exc:
        log.warning('检索缓存写入失败，不影响本次检索: {}', exc)
