"""统一求值函数（kb-ownership-and-acl-v2 spec §4.4/§5.1，D44）。

resolve_kb_perm 是 KB 资源权限的**唯一求值点**：KB 列表/详情/检索/问答/Agent/
管理/ACL 各入口统一调用（Phase 3 接线）。求值核心 evaluate_kb_perm 为纯函数
（不写库、不依赖请求上下文），语义：

1. 丢弃 expires_at <= now 的条目（过期即忽略，D44）
2. deny 优先：主体集合命中任一显式 deny 条目 → None（高于一切，含 user allow；
   口径待评审确认，spec §4.4 注）
3. allow 取最高级（owner > manage > contribute > read，按序数）
4. user 直接授权优先：user 主体命中时其 perm 覆盖 role/dept/group 的结果
5. kb.owner_id == user → OWNER；kb.is_public → 至少 READ（均仍受 deny 约束）
6. 以上皆无 → None（default deny，D45）
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.kb.crud import knowledge_base_dao
from backend.src.app.kb.crud.crud_acl import kb_acl_dao
from backend.src.app.kb.service.acl.principals import Principal, expand_principals
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.utils.timezone import timezone

__all__ = ['AclEntry', 'Perm', 'evaluate_kb_perm', 'perm_at_least', 'resolve_kb_perm', 'resolve_visible_kbs']


class Perm(StrEnum):
    """KB 权限级别（高级包含低级，比较用序数）。"""

    READ = 'read'
    CONTRIBUTE = 'contribute'
    MANAGE = 'manage'
    OWNER = 'owner'


_PERM_RANK: dict[Perm, int] = {
    Perm.READ: 0,
    Perm.CONTRIBUTE: 1,
    Perm.MANAGE: 2,
    Perm.OWNER: 3,
}


def perm_at_least(perm: Perm | None, threshold: Perm) -> bool:
    """perm >= threshold（None 恒 False）；各入口的资源级判定用。"""
    return perm is not None and _PERM_RANK[perm] >= _PERM_RANK[threshold]


@dataclass(frozen=True)
class AclEntry:
    """求值用的 ACL 条目（自 KbAcl 模型行转换）。"""

    principal: Principal
    perm: Perm
    effect: str  # allow / deny
    expires_at: datetime | None = None


def _to_acl_entry(row: Any) -> AclEntry:
    return AclEntry(
        principal=Principal(type=row.principal_type, id=row.principal_id),
        perm=Perm(row.perm),
        effect=row.effect,
        expires_at=row.expires_at,
    )


def evaluate_kb_perm(
    *,
    user_id: str,
    owner_id: str | None,
    is_public: bool,
    principals: Iterable[Principal],
    entries: Iterable[AclEntry],
    now: datetime,
) -> Perm | None:
    """KB 权限求值纯函数（语义见模块 docstring；None = 不可见）。"""
    principal_set = set(principals)
    active = [e for e in entries if e.expires_at is None or e.expires_at > now]

    # deny 优先：显式拒绝高于一切（含 user 直接 allow）
    if any(e.effect == 'deny' and e.principal in principal_set for e in active):
        return None

    # allow 取最高级；user 直接授权优先于 role/dept/group
    user_allows = [
        e.perm for e in active if e.effect == 'allow' and e.principal.type == 'user' and e.principal in principal_set
    ]
    indirect_allows = [
        e.perm for e in active if e.effect == 'allow' and e.principal.type != 'user' and e.principal in principal_set
    ]
    best: Perm | None
    if user_allows:
        best = max(user_allows, key=lambda p: _PERM_RANK[p])
    else:
        best = max(indirect_allows, key=lambda p: _PERM_RANK[p]) if indirect_allows else None

    # owner 兜底；公开库至少 READ（均仍受 deny 约束）
    if owner_id is not None and owner_id == user_id:
        best = Perm.OWNER
    if is_public and (best is None or _PERM_RANK[best] < _PERM_RANK[Perm.READ]):
        best = Perm.READ
    return best


async def resolve_kb_perm(
    db: AsyncSession, *, user_id: str, dept_id: int | None, roles: list[str] | None, kb_name: str
) -> Perm | None:
    """用户在指定 KB 上的最高有效权限；None = 不可见（含 KB 不存在）。"""
    ns = instance_namespace()
    kb = await knowledge_base_dao.get(db, kb_name, plugin_namespace=ns)
    if kb is None:
        return None
    principals = await expand_principals(db, user_id=user_id, dept_id=dept_id, roles=roles)
    rows = await kb_acl_dao.list_entries(db, kb_name=kb_name, plugin_namespace=kb.plugin_namespace)
    return evaluate_kb_perm(
        user_id=user_id,
        owner_id=kb.owner_id,
        is_public=kb.is_public,
        principals=principals,
        entries=[_to_acl_entry(row) for row in rows],
        now=timezone.now(),
    )


async def resolve_visible_kbs(
    db: AsyncSession,
    *,
    user_id: str,
    dept_id: int | None,
    roles: list[str] | None,
    kb_names: list[str] | None = None,
) -> list[str]:
    """批量求值用户可见 KB 集合（KB 列表过滤用，禁止逐库调 resolve_kb_perm 的 N+1）。

    kb_names 传 None = 求值整域；传入时只在其子集内求值（不隐式求交，交由调用方）。
    """
    ns = instance_namespace()
    kbs = await knowledge_base_dao.list_all(db, plugin_namespace=ns)
    if kb_names is not None:
        wanted = set(kb_names)
        kbs = [kb for kb in kbs if kb.kb_name in wanted]

    principals = set(await expand_principals(db, user_id=user_id, dept_id=dept_id, roles=roles))
    rows = await kb_acl_dao.list_entries_by_kbs(db, kb_names=[kb.kb_name for kb in kbs], plugin_namespace=ns)
    entries_by_kb: dict[str, list[AclEntry]] = {}
    for row in rows:
        entries_by_kb.setdefault(row.kb_name, []).append(_to_acl_entry(row))

    now = timezone.now()
    visible: list[str] = []
    for kb in kbs:
        perm = evaluate_kb_perm(
            user_id=user_id,
            owner_id=kb.owner_id,
            is_public=kb.is_public,
            principals=principals,
            entries=entries_by_kb.get(kb.kb_name, []),
            now=now,
        )
        if perm is not None:
            visible.append(kb.kb_name)
    return visible
