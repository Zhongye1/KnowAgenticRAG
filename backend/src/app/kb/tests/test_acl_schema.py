"""ACL DTO 校验测试（agent-layer spec ACL 设计 §8）。"""

from __future__ import annotations

import pytest

from pydantic import ValidationError

from backend.src.app.kb.schema.acl import DocAclUpdateParam, KBAclUpdateParam


class TestDocAclUpdateParam:
    # 注：显式传 None 与省略字段等价（Field 默认值即为 None），规避 pyright 对 pydantic Field 默认值的误判
    def test_visibility_valid(self) -> None:
        for value in ('public', 'restricted', 'private'):
            assert DocAclUpdateParam(visibility=value, group_ids=None).visibility == value

    def test_visibility_none_keeps_unchanged(self) -> None:
        assert DocAclUpdateParam(visibility=None, group_ids=None).visibility is None

    def test_visibility_invalid_rejected(self) -> None:
        with pytest.raises(ValidationError, match='visibility'):
            DocAclUpdateParam(visibility='internal', group_ids=None)

    def test_group_ids_dedup_and_strip(self) -> None:
        param = DocAclUpdateParam(visibility=None, group_ids=['g1', ' g1 ', 'g2', ''])
        assert param.group_ids == ['g1', 'g2']

    def test_group_ids_none_means_unchanged(self) -> None:
        assert DocAclUpdateParam(visibility=None, group_ids=None).group_ids is None


class TestKBAclUpdateParam:
    def test_group_ids_dedup(self) -> None:
        param = KBAclUpdateParam(group_ids=['10', '10', ' 20 ', ''])
        assert param.group_ids == ['10', '20']

    def test_empty_group_ids_allowed(self) -> None:
        assert KBAclUpdateParam().group_ids == []
