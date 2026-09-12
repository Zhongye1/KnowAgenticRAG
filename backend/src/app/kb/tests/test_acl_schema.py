"""ACL DTO 校验测试（kb-ownership-and-acl-v2 spec §4，条目化授权）。"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from pydantic import ValidationError

from backend.src.app.kb.schema.acl import DocAclEntry, DocAclUpdateParam, KBAclEntry, KBAclUpdateParam


class TestKBAclEntry:
    def test_valid_entry(self) -> None:
        entry = KBAclEntry(principal_type='dept', principal_id='10', perm='manage', effect='allow')
        assert entry.perm == 'manage'

    def test_expires_at_accepted(self) -> None:
        expires = datetime(2026, 12, 31, tzinfo=UTC)
        entry = KBAclEntry(principal_type='user', principal_id='u1', perm='read', expires_at=expires)
        assert entry.expires_at == expires

    def test_principal_type_whitelist(self) -> None:
        with pytest.raises(ValidationError, match='principal_type'):
            KBAclEntry(principal_type='team', principal_id='x')

    def test_perm_whitelist(self) -> None:
        with pytest.raises(ValidationError, match='perm'):
            KBAclEntry(principal_type='dept', principal_id='10', perm='admin')

    def test_effect_whitelist(self) -> None:
        with pytest.raises(ValidationError, match='effect'):
            KBAclEntry(principal_type='dept', principal_id='10', effect='block')

    def test_blank_principal_id_rejected(self) -> None:
        with pytest.raises(ValidationError, match='principal_id'):
            KBAclEntry(principal_type='dept', principal_id='  ')

    def test_deny_supported(self) -> None:
        entry = KBAclEntry(principal_type='user', principal_id='u1', perm='read', effect='deny')
        assert entry.effect == 'deny'


class TestDocAclEntry:
    def test_user_dept_allowed(self) -> None:
        for ptype in ('user', 'dept'):
            entry = DocAclEntry(principal_type=ptype, principal_id='10')
            assert entry.perm == 'read'

    def test_role_group_rejected_by_mirror_constraint(self) -> None:
        for ptype in ('role', 'group'):
            with pytest.raises(ValidationError, match='主体类型'):
                DocAclEntry(principal_type=ptype, principal_id='10')

    def test_deny_rejected(self) -> None:
        with pytest.raises(ValidationError, match='deny'):
            DocAclEntry(principal_type='dept', principal_id='10', effect='deny')

    def test_expires_at_rejected(self) -> None:
        with pytest.raises(ValidationError, match='expires_at'):
            DocAclEntry(principal_type='dept', principal_id='10', expires_at=datetime(2026, 12, 31, tzinfo=UTC))


class TestKBAclUpdateParam:
    def test_entries_dedupe_by_principal(self) -> None:
        param = KBAclUpdateParam(
            entries=[
                KBAclEntry(principal_type='dept', principal_id='10', perm='read'),
                KBAclEntry(principal_type='dept', principal_id='10', perm='manage'),
                KBAclEntry(principal_type='dept', principal_id=' 10 ', perm='read'),
            ]
        )
        assert [(e.principal_type, e.principal_id) for e in param.entries] == [('dept', '10')]

    def test_empty_entries_allowed(self) -> None:
        assert KBAclUpdateParam(entries=[]).entries == []


class TestDocAclUpdateParam:
    def test_visibility_valid(self) -> None:
        for value in ('public', 'restricted', 'private'):
            assert DocAclUpdateParam(visibility=value, entries=None).visibility == value

    def test_visibility_none_keeps_unchanged(self) -> None:
        assert DocAclUpdateParam(visibility=None, entries=None).visibility is None

    def test_visibility_invalid_rejected(self) -> None:
        with pytest.raises(ValidationError, match='visibility'):
            DocAclUpdateParam(visibility='internal', entries=None)

    def test_entries_none_means_unchanged(self) -> None:
        assert DocAclUpdateParam(visibility=None, entries=None).entries is None

    def test_entries_dedupe(self) -> None:
        param = DocAclUpdateParam(
            visibility=None,
            entries=[
                DocAclEntry(principal_type='dept', principal_id='10'),
                DocAclEntry(principal_type='dept', principal_id='10'),
                DocAclEntry(principal_type='user', principal_id='u1'),
            ],
        )
        assert param.entries is not None
        assert len(param.entries) == 2
