"""权限控制三层矩阵（P0，重点）。

分三组：

1. **求值不变量**（纯函数，无需依赖栈）：``evaluate_kb_perm`` 的语义逐条钉死。
2. **资源权限矩阵**（HTTP）：权限级别 read < contribute < manage < owner 在真实端点上的
   表现——不足一律 **404**（D50 不泄露存在性）。
3. **功能权限 vs 资源权限**：两层失败形态不同（403 / 404），必须能区分。

刻意不做的事：不 override 任何鉴权依赖。override 掉 JWT/scope 就等于把被测的 ACL 层
整个跳过，用例会假绿（chat/agent 的罐头冒烟正是如此，所以它们不测权限）。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import pytest

from backend.e2e.support import seed
from backend.e2e.support.api import API, err, ok_data
from backend.src.app.kb.service.acl.principals import Principal
from backend.src.app.kb.service.acl.resolver import AclEntry, Perm, evaluate_kb_perm
from backend.src.app.mcp.schemas import PERM_KB_CHAT, PERM_KB_LIST, PERM_KB_READ, PERM_KB_SEARCH

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from httpx import AsyncClient

    from backend.e2e.support.identity import Identity

pytestmark = pytest.mark.p0

_NOW = datetime(2026, 9, 21, 12, 0, tzinfo=UTC)
_PAGE = {'page': 1, 'size': 100}


# --------------------------------------------------------------------------- 1. 求值不变量


def _eval(
    *,
    user_id: str = 'u1',
    owner_id: str | None = None,
    is_public: bool = False,
    principals: tuple[Principal, ...] = (),
    entries: tuple[AclEntry, ...] = (),
) -> Perm | None:
    return evaluate_kb_perm(
        user_id=user_id,
        owner_id=owner_id,
        is_public=is_public,
        principals=principals,
        entries=entries,
        now=_NOW,
    )


def _entry(principal: Principal, perm: Perm, *, effect: str = 'allow', expires_at: datetime | None = None) -> AclEntry:
    return AclEntry(principal=principal, perm=perm, effect=effect, expires_at=expires_at)


def test_default_deny_without_entries() -> None:
    """无任何条目 → 不可见（v1「ACL 表为空 = 全放开」的兜底已移除，D45）。"""
    assert _eval(principals=(Principal('user', 'u1'),)) is None


def test_deny_beats_user_allow() -> None:
    """显式 deny 高于一切 allow，包括 user 直接授权。"""
    user, dept = Principal('user', 'u1'), Principal('dept', 'd1')
    entries = (_entry(user, Perm.MANAGE), _entry(dept, Perm.READ, effect='deny'))
    assert _eval(principals=(user, dept), entries=entries) is None


def test_user_allow_beats_dept_allow() -> None:
    """user 直接授权覆盖 role/dept/group 的结果（即使 dept 给的更高）。"""
    user, dept = Principal('user', 'u1'), Principal('dept', 'd1')
    entries = (_entry(dept, Perm.MANAGE), _entry(user, Perm.READ))
    assert _eval(principals=(user, dept), entries=entries) is Perm.READ


def test_highest_allow_wins_among_indirect() -> None:
    """同为间接授权时取最高级。"""
    dept, role = Principal('dept', 'd1'), Principal('role', 'r1')
    entries = (_entry(dept, Perm.READ), _entry(role, Perm.CONTRIBUTE))
    assert _eval(principals=(dept, role), entries=entries) is Perm.CONTRIBUTE


def test_owner_id_grants_owner() -> None:
    """``kb.owner_id == user`` → OWNER（即使没有任何条目）。"""
    assert _eval(user_id='u1', owner_id='u1') is Perm.OWNER


def test_public_grants_read() -> None:
    """公开库至少 READ。"""
    assert _eval(is_public=True) is Perm.READ


def test_public_still_subject_to_deny() -> None:
    """公开库仍受 deny 约束（deny 优先于 public 兜底）。"""
    user = Principal('user', 'u1')
    assert _eval(is_public=True, principals=(user,), entries=(_entry(user, Perm.READ, effect='deny'),)) is None


def test_expired_entry_is_ignored() -> None:
    """过期条目即忽略（既不授权也不拒绝）。"""
    user = Principal('user', 'u1')
    expired = _entry(user, Perm.MANAGE, expires_at=_NOW - timedelta(seconds=1))
    assert _eval(principals=(user,), entries=(expired,)) is None


def test_unexpired_entry_is_honored() -> None:
    user = Principal('user', 'u1')
    alive = _entry(user, Perm.MANAGE, expires_at=_NOW + timedelta(hours=1))
    assert _eval(principals=(user,), entries=(alive,)) is Perm.MANAGE


def test_non_participant_principal_is_ignored() -> None:
    """条目主体不在用户主体集内 → 不生效。"""
    entries = (_entry(Principal('dept', 'd_other'), Perm.OWNER),)
    assert _eval(principals=(Principal('user', 'u1'),), entries=entries) is None


# --------------------------------------------------------------------------- 2. 资源权限矩阵


async def _grant(client: AsyncClient, identities: dict[str, Identity], kb: str, persona: str, perm: str) -> None:
    """Owner 授予某主体 KB 级权限（走真实 ACL 写接口）。"""
    await seed.grant_kb_acl(
        client,
        identities['owner'].headers,
        kb,
        [
            {
                'principal_type': 'user',
                'principal_id': str(identities[persona].user_id),
                'perm': perm,
                'effect': 'allow',
            }
        ],
    )


def _kb_names(data: dict[str, Any]) -> list[str]:
    return [item['kb_name'] for item in data['items']]


async def test_absent_and_denied_kb_are_indistinguishable(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """D50：无权访问与 KB 不存在必须同形态，否则接口成了存在性探测器。"""
    kb = await make_kb()
    headers = identities['outsider'].headers
    denied = err(await client.get(f'{API}/knowledge_bases/{kb}', headers=headers), 404)
    absent = err(await client.get(f'{API}/knowledge_bases/e2e_absent_kb', headers=headers), 404)
    assert denied['msg'] == absent['msg'], f'两者文案不同，存在性被泄露：{denied["msg"]!r} vs {absent["msg"]!r}'


async def test_outsider_kb_is_invisible_in_list(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """列表按 ``resolve_visible_kbs`` 过滤：无授权主体看不到该 KB。"""
    kb = await make_kb()
    outsider = ok_data(await client.get(f'{API}/knowledge_bases', params=_PAGE, headers=identities['outsider'].headers))
    owner = ok_data(await client.get(f'{API}/knowledge_bases', params=_PAGE, headers=identities['owner'].headers))
    assert kb not in _kb_names(outsider)
    assert kb in _kb_names(owner)


async def test_reader_can_read_but_not_upload(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """read 级：能看详情，上传（需 contribute）404。"""
    kb = await make_kb()
    await _grant(client, identities, kb, 'reader', 'read')
    headers = identities['reader'].headers
    ok_data(await client.get(f'{API}/knowledge_bases/{kb}', headers=headers))
    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/documents',
        files={'file': ('a.md', b'# a\n', 'text/markdown')},
        data={'source_type': 'file'},
        headers=headers,
    )
    err(resp, 404)


async def test_contributor_can_upload_but_not_manage(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """contribute 级：能上传，不能删库（需 owner）。"""
    kb = await make_kb()
    await _grant(client, identities, kb, 'contributor', 'contribute')
    headers = identities['contributor'].headers
    uploaded = await seed.upload_document(client, headers, kb)
    assert uploaded['status'] == 'pending'
    err(await client.delete(f'{API}/knowledge_bases/{kb}', headers=headers), 404)


async def test_manager_can_delete_document_but_not_change_acl(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """manage 级：能管文档，不能改 ACL（需 owner）。"""
    kb = await make_kb()
    await _grant(client, identities, kb, 'manager', 'manage')
    headers = identities['manager'].headers
    doc = await seed.upload_document(client, headers, kb)
    ok_data(await client.delete(f'{API}/documents/{doc["document_id"]}', headers=headers))
    resp = await client.put(f'{API}/knowledge_bases/{kb}/acl', json={'entries': []}, headers=headers)
    err(resp, 404)


async def test_mate_in_same_dept_has_no_implicit_access(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """同部门不等于有权限：没有条目就是 default deny（不存在「部门默认可见」）。"""
    kb = await make_kb()
    err(await client.get(f'{API}/knowledge_bases/{kb}', headers=identities['mate'].headers), 404)


async def test_non_owner_cannot_grant_acl(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """授权动作本身也要鉴权：非 owner 改 ACL → 404（不能通过改 ACL 提权）。"""
    kb = await make_kb()
    resp = await client.put(
        f'{API}/knowledge_bases/{kb}/acl',
        json={
            'entries': [
                {
                    'principal_type': 'user',
                    'principal_id': str(identities['outsider'].user_id),
                    'perm': 'owner',
                    'effect': 'allow',
                }
            ]
        },
        headers=identities['outsider'].headers,
    )
    err(resp, 404)


async def test_owner_can_grant_and_target_then_gains_access(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """授权链路正向：owner 授权后，被授权主体立即可见（授权不是摆设）。"""
    kb = await make_kb()
    err(await client.get(f'{API}/knowledge_bases/{kb}', headers=identities['outsider'].headers), 404)
    await _grant(client, identities, kb, 'outsider', 'read')
    ok_data(await client.get(f'{API}/knowledge_bases/{kb}', headers=identities['outsider'].headers))


async def test_acl_replacement_revokes_previous_grant(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """entries 是全量替换语义：清空后原被授权主体立即失去访问。"""
    kb = await make_kb()
    await _grant(client, identities, kb, 'reader', 'read')
    ok_data(await client.get(f'{API}/knowledge_bases/{kb}', headers=identities['reader'].headers))
    await seed.revoke_kb_acl(client, identities['owner'].headers, kb)
    err(await client.get(f'{API}/knowledge_bases/{kb}', headers=identities['reader'].headers), 404)


async def test_deny_entry_overrides_allow_in_http_path(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """deny 优先在真实接口上同样成立（纯函数语义的 HTTP 复验）。"""
    kb = await make_kb()
    reader = identities['reader']
    await seed.grant_kb_acl(
        client,
        identities['owner'].headers,
        kb,
        [
            {'principal_type': 'user', 'principal_id': str(reader.user_id), 'perm': 'manage', 'effect': 'allow'},
            {'principal_type': 'dept', 'principal_id': str(reader.dept_id), 'perm': 'read', 'effect': 'deny'},
        ],
    )
    err(await client.get(f'{API}/knowledge_bases/{kb}', headers=reader.headers), 404)


async def test_public_kb_is_readable_by_outsider(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """公开库：owner 置 is_public 后，无任何 ACL 条目的跨部门主体也能读（public 兜底 READ）。"""
    kb = await make_kb()
    owner_headers = identities['owner'].headers
    outsider_headers = identities['outsider'].headers
    err(await client.get(f'{API}/knowledge_bases/{kb}', headers=outsider_headers), 404)
    ok_data(await client.patch(f'{API}/knowledge_bases/{kb}', json={'is_public': True}, headers=owner_headers))
    detail = ok_data(await client.get(f'{API}/knowledge_bases/{kb}', headers=outsider_headers))
    assert detail['is_public'] is True
    # 但 public 不给写：contribute 级动作仍需 ACL/owner（D45 兜底只到 READ）
    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/documents',
        files={'file': ('a.md', b'# a\n', 'text/markdown')},
        data={'source_type': 'file'},
        headers=outsider_headers,
    )
    err(resp, 404)


async def test_patch_kb_requires_owner_not_just_manage(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """改 KB（含 is_public）要求资源级 OWNER：manage 级主体同形态 404（D50）。"""
    kb = await make_kb()
    await _grant(client, identities, kb, 'manager', 'manage')
    resp = await client.patch(
        f'{API}/knowledge_bases/{kb}', json={'is_public': True}, headers=identities['manager'].headers
    )
    err(resp, 404)


# --------------------------------------------------------------------------- 3. 功能权限 vs 资源权限


async def test_missing_functional_perm_is_403_not_404(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """资源权限给足，但角色缺功能码 → 403（RBAC 先于资源判定，两层失败形态必须可区分）。"""
    kb = await make_kb()
    await _grant(client, identities, kb, 'readonly_role', 'manage')
    headers = identities['readonly_role'].headers
    ok_data(await client.get(f'{API}/knowledge_bases/{kb}', headers=headers))
    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/documents',
        files={'file': ('a.md', b'# a\n', 'text/markdown')},
        data={'source_type': 'file'},
        headers=headers,
    )
    err(resp, 403)


async def test_transfer_requires_functional_code(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """转移所有权由功能码 ``rag:kb:transfer`` 把关，不要求发起人是 owner——缺码即 403。"""
    kb = await make_kb()
    await _grant(client, identities, kb, 'readonly_role', 'manage')
    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/transfer',
        json={'new_owner_id': str(identities['owner'].user_id)},
        headers=identities['readonly_role'].headers,
    )
    err(resp, 403)


async def test_transfer_is_gated_only_by_functional_code(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """转移**不做**资源级 == owner 校验（spec §7.1 兜底：旧 Owner 可能已不可用）。

    这条用例把「transfer 的权限边界就是功能码本身」钉住：持码的非 owner 也能转移，
    转移后旧 owner 立即失去 owner 兜底。若将来收紧要资源校验，这里会红——是有意的信号。
    """
    kb = await make_kb()
    target = identities['outsider']
    data = ok_data(
        await client.post(
            f'{API}/knowledge_bases/{kb}/transfer',
            json={'new_owner_id': str(target.user_id)},
            headers=identities['manager'].headers,
        )
    )
    assert data['owner_id'] == str(target.user_id)
    assert data['previous_owner_id'] == str(identities['owner'].user_id)
    # 旧 owner 的 owner 条目被回收且无其他条目 → 同形态 404
    err(await client.get(f'{API}/knowledge_bases/{kb}', headers=identities['owner'].headers), 404)
    ok_data(await client.get(f'{API}/knowledge_bases/{kb}', headers=target.headers))
    # 库已易主：清理必须用新 owner 的凭据
    await seed.delete_kb(client, target.headers, kb)


async def test_transfer_to_current_owner_is_409(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """同一 Owner 重复转移：业务冲突 409（不是静默成功）。"""
    kb = await make_kb()
    resp = await client.post(
        f'{API}/knowledge_bases/{kb}/transfer',
        json={'new_owner_id': str(identities['owner'].user_id)},
        headers=identities['owner'].headers,
    )
    err(resp, 409)


async def test_owner_can_transfer_ownership(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """正向：owner 持 transfer 功能码，可把库转给他人，转移后新 owner 拿到 OWNER。"""
    kb = await make_kb()
    target = identities['manager']
    data = ok_data(
        await client.post(
            f'{API}/knowledge_bases/{kb}/transfer',
            json={'new_owner_id': str(target.user_id)},
            headers=identities['owner'].headers,
        )
    )
    assert data['owner_id'] == str(target.user_id)
    ok_data(await client.get(f'{API}/knowledge_bases/{kb}', headers=target.headers))
    await seed.delete_kb(client, target.headers, kb)


async def test_superuser_is_not_exempt_from_resource_perm(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """超管免 RBAC（rbac_verify 提前返回），但不免资源权限：非 owner 无条目 → 404。

    主体用 ``is_superuser`` 标记直造，不走 admin 登录（登录受验证码开关约束）。
    """
    kb = await make_kb()
    err(await client.get(f'{API}/knowledge_bases/{kb}', headers=identities['superuser'].headers), 404)


# --------------------------------------------------------------------------- 4. 租户边界


async def test_namespace_mismatch_is_403(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """X-Plugin-Namespace 只能「选」不能「越」：显式传非实例域 → 403。"""
    resp = await client.get(
        f'{API}/knowledge_bases',
        headers={**identities['owner'].headers, 'X-Plugin-Namespace': 'acme'},
    )
    err(resp, 403)


async def test_matching_namespace_is_accepted(client: AsyncClient, identities: dict[str, Identity]) -> None:
    """显式传实例域本身（core）应当放行。"""
    ok_data(
        await client.get(
            f'{API}/knowledge_bases',
            params=_PAGE,
            headers={**identities['owner'].headers, 'X-Plugin-Namespace': 'core'},
        )
    )


# --------------------------------------------------------------------------- 5. 部门祖先链


async def test_dept_ancestor_chain_grants_access(
    client: AsyncClient, identities: dict[str, Identity], make_kb: Callable[..., Awaitable[str]]
) -> None:
    """授权给父部门，子部门用户经祖先链展开获得权限（``_walk_dept_ancestors``）。"""
    kb = await make_kb()
    child = identities['dept_child']
    err(await client.get(f'{API}/knowledge_bases/{kb}', headers=child.headers), 404)
    await seed.grant_kb_acl(
        client,
        identities['owner'].headers,
        kb,
        [
            {
                'principal_type': 'dept',
                'principal_id': str(identities['outsider'].dept_id),
                'perm': 'read',
                'effect': 'allow',
            }
        ],
    )
    ok_data(await client.get(f'{API}/knowledge_bases/{kb}', headers=child.headers))


# --------------------------------------------------------------------------- 6. 功能码单一来源


def test_mcp_scopes_share_single_source_with_http_perms() -> None:
    """D30：MCP 权限点与 HTTP RBAC 权限码同源，不得各写一份。"""
    from backend.src.app.kb.utils.permissions import RAG_KB_CHAT, RAG_KB_LIST, RAG_KB_READ, RAG_KB_SEARCH

    assert (PERM_KB_LIST, PERM_KB_SEARCH, PERM_KB_READ, PERM_KB_CHAT) == (
        RAG_KB_LIST,
        RAG_KB_SEARCH,
        RAG_KB_READ,
        RAG_KB_CHAT,
    )
