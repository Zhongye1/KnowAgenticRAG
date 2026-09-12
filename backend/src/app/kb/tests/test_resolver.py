"""统一求值函数单测（kb-ownership-and-acl-v2 spec §4.4/§9.1，D44/D45）。

evaluate_kb_perm 为纯函数，全部语义用例在无 DB 环境覆盖；
resolve_kb_perm/resolve_visible_kbs 的 DB 接线在 Phase 3 验收测试覆盖。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from backend.src.app.kb.service.acl.principals import Principal
from backend.src.app.kb.service.acl.resolver import AclEntry, Perm, evaluate_kb_perm, perm_at_least

NOW = datetime(2026, 9, 12, 12, 0, 0, tzinfo=UTC)
USER = 'u_1'
OWNER = 'u_9'


def _principal_set(*, dept: str | None = '10', role: str | None = None) -> list[Principal]:
    principals = [Principal('user', USER)]
    if role:
        principals.append(Principal('role', role))
    if dept:
        principals.extend([Principal('dept', dept), Principal('dept', '1')])  # 直属 + 祖先
    return principals


def _entry(
    ptype: str,
    pid: str,
    perm: Perm = Perm.READ,
    effect: str = 'allow',
    expires_at: datetime | None = None,
) -> AclEntry:
    return AclEntry(principal=Principal(ptype, pid), perm=perm, effect=effect, expires_at=expires_at)


def _eval(
    entries: list[AclEntry],
    principals: list[Principal] | None = None,
    *,
    owner_id: str | None = None,
    is_public: bool = False,
) -> Perm | None:
    return evaluate_kb_perm(
        user_id=USER,
        owner_id=owner_id,
        is_public=is_public,
        principals=principals or _principal_set(),
        entries=entries,
        now=NOW,
    )


class TestDefaultDeny:
    def test_no_entries_no_owner_not_public_is_none(self) -> None:
        assert _eval([]) is None

    def test_unrelated_principal_entry_ignored(self) -> None:
        assert _eval([_entry('dept', '999', Perm.OWNER)]) is None

    def test_role_principal_allow_visible(self) -> None:
        assert _eval([_entry('role', 'r1', Perm.READ)], _principal_set(dept=None, role='r1')) == Perm.READ


class TestLevels:
    def test_dept_allow_read(self) -> None:
        assert _eval([_entry('dept', '10')]) == Perm.READ

    def test_highest_level_wins(self) -> None:
        assert _eval([_entry('dept', '10'), _entry('dept', '1', Perm.MANAGE)]) == Perm.MANAGE

    def test_perm_at_least_ordinal_inclusion(self) -> None:
        assert perm_at_least(Perm.MANAGE, Perm.CONTRIBUTE)
        assert perm_at_least(Perm.OWNER, Perm.READ)
        assert not perm_at_least(Perm.READ, Perm.CONTRIBUTE)
        assert not perm_at_least(None, Perm.READ)


class TestDenyPriority:
    def test_user_deny_beats_dept_allow(self) -> None:
        entries = [_entry('dept', '10'), _entry('user', USER, effect='deny')]
        assert _eval(entries) is None

    def test_dept_deny_beats_user_allow(self) -> None:
        """§4.4 口径：显式 deny 高于一切——部门 deny、个人 allow 仍不可见（待评审确认）。"""
        entries = [_entry('dept', '10', effect='deny'), _entry('user', USER, Perm.MANAGE)]
        assert _eval(entries) is None

    def test_unrelated_deny_ignored(self) -> None:
        entries = [_entry('dept', '10'), _entry('user', 'u_other', effect='deny')]
        assert _eval(entries) == Perm.READ

    def test_deny_beats_owner(self) -> None:
        entries = [_entry('user', USER, effect='deny')]
        assert _eval(entries, owner_id=USER) is None


class TestUserPriority:
    def test_user_direct_overrides_higher_indirect(self) -> None:
        """user 直接授权覆盖 role/dept/group 的结果（哪怕级别更低）。"""
        entries = [_entry('dept', '10', Perm.MANAGE), _entry('user', USER, Perm.READ)]
        assert _eval(entries) == Perm.READ

    def test_indirect_used_when_no_direct(self) -> None:
        entries = [_entry('dept', '10', Perm.MANAGE)]
        assert _eval(entries) == Perm.MANAGE


class TestExpiry:
    def test_expired_allow_ignored(self) -> None:
        expired = _entry('dept', '10', expires_at=NOW - timedelta(seconds=1))
        assert _eval([expired]) is None

    def test_active_allow_kept(self) -> None:
        active = _entry('dept', '10', expires_at=NOW + timedelta(seconds=1))
        assert _eval([active]) == Perm.READ

    def test_expired_deny_no_longer_blocks(self) -> None:
        entries = [
            _entry('user', USER, effect='deny', expires_at=NOW - timedelta(seconds=1)),
            _entry('dept', '10'),
        ]
        assert _eval(entries) == Perm.READ


class TestOwnerAndPublic:
    def test_owner_without_entries(self) -> None:
        assert _eval([], owner_id=USER) == Perm.OWNER

    def test_owner_not_affected_by_other_principal(self) -> None:
        assert _eval([_entry('dept', '999', Perm.READ)], owner_id=USER) == Perm.OWNER

    def test_public_grants_at_least_read(self) -> None:
        assert _eval([], is_public=True) == Perm.READ

    def test_public_keeps_higher_level(self) -> None:
        assert _eval([_entry('dept', '10', Perm.MANAGE)], is_public=True) == Perm.MANAGE

    def test_public_still_blocked_by_deny(self) -> None:
        assert _eval([_entry('user', USER, effect='deny')], is_public=True) is None
