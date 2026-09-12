"""Scope → Milvus 过滤表达式（检索关注点；kb-ownership-and-acl-v2 spec §5.3）。

Scope / UserContext / build_retrieval_scope 已下沉 kb 域
（``backend.src.app.kb.service.acl.scope``，D46：数据权限归数据所有者）；
本模块只保留检索侧的两个关注点：ID 白名单校验与表达式生成。

过滤发生在召回内部（不是召回后过滤）、过滤条件由服务端构造（不是客户端传入）、
kb_name 必须与授权范围求交（不是拿来就用）。
"""

from __future__ import annotations

import re

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.app.kb.service.acl.scope import Scope

__all__ = ['to_milvus_expr', 'validate_ids_for_expr']

# ID 白名单校验：只允许字母、数字、下划线、连字符
_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]+$')
_MAX_IDS_IN_EXPR = 200  # 防止表达式过长


def validate_ids_for_expr(ids: list[str], field_name: str) -> None:
    """校验 ID 列表符合白名单规则（防注入）。"""
    if len(ids) > _MAX_IDS_IN_EXPR:
        raise ValueError(f'{field_name} 数量超限: {len(ids)} > {_MAX_IDS_IN_EXPR}')
    for item in ids:
        if not _ID_PATTERN.match(item):
            raise ValueError(f'{field_name} 包含非法字符: {item}')


def to_milvus_expr(scope: Scope) -> str:
    """Scope → Milvus 过滤表达式（ID 白名单校验防注入）。

    表达式语义：
    - namespace 精确匹配（租户硬边界）
    - visibility == "public" OR owner_id == user_id OR groups 有交集（文档级 ACL）

    注意：``kb_name`` 过滤由 ``search_ragf_kb()`` 在 Milvus 层注入（单 KB per
    call），KB 级 ACL 在服务层通过 ``allowed_kbs`` 求交校验，不在本表达式内。
    """
    # 安全兜底：无权访问任何 KB 时返回不匹配表达式
    if not scope.allowed_kbs:
        return 'namespace == "__no_access__"'

    # 白名单校验
    validate_ids_for_expr([scope.namespace], 'namespace')
    validate_ids_for_expr(scope.groups, 'groups')
    if scope.user_id:
        validate_ids_for_expr([scope.user_id], 'user_id')

    # 文档级 ACL：visibility == "public" or owner_id == user or groups 有交集
    doc_filters = ['visibility == "public"']
    if scope.user_id:
        doc_filters.append(f'owner_id == "{scope.user_id}"')
    if scope.groups:
        groups = ','.join(f'"{g}"' for g in scope.groups)
        doc_filters.append(f'array_contains_any(groups, [{groups}])')
    doc_filter = ' or '.join(doc_filters)

    return f'namespace == "{scope.namespace}" and ({doc_filter})'
