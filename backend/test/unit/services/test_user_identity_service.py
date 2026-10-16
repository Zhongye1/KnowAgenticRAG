"""登录标识与手机号的格式规则。

注册端点用到的两条前提在这里钉住：
- `validate_uid` 必须整串匹配（`$` 也匹配结尾换行，`"admin\\n"` 会冒充 `admin`）；
- 由用户名生成的 uid **不可能**是纯数字，因此永远不会与手机号形态重合——管理员建号走的是
  生成路径，这是它不会撞上别人手机号的原因（注册路径则显式检查两个方向）。
"""

from __future__ import annotations

import pytest

from ars.services.user_identity_service import (
    generate_uid,
    generate_unique_uid,
    validate_uid,
)


@pytest.mark.parametrize("uid", ["abc", "abc_123", "a" * 20, "ABC123"])
def test_validate_uid_accepts_three_to_twenty_word_characters(uid):
    assert validate_uid(uid) == (True, "")


@pytest.mark.parametrize(
    ("uid", "message"),
    [
        ("ab", "用户ID长度必须在3-20个字符之间"),
        ("a" * 21, "用户ID长度必须在3-20个字符之间"),
        ("bad-uid", "用户ID只能包含字母、数字和下划线"),
        ("bad.uid", "用户ID只能包含字母、数字和下划线"),
        # `$` 也匹配结尾换行：不加 fullmatch 时这条会通过
        ("admin\n", "用户ID只能包含字母、数字和下划线"),
        ("admin\n\n", "用户ID只能包含字母、数字和下划线"),
        ("", "用户ID只能包含字母、数字和下划线"),
    ],
)
def test_validate_uid_rejects_invalid_forms(uid, message):
    assert validate_uid(uid) == (False, message)


@pytest.mark.parametrize("username", ["13800000001", "13902988446", "1234", "0"])
def test_generated_uid_is_never_all_digits(username):
    """数字开头的用户名会被加 `u` 前缀，生成的 uid 因此不会与手机号形态重合。"""
    for uid in (generate_uid(username), generate_unique_uid(username, [])):
        assert not uid.isdigit(), uid
        assert uid[0].isalpha(), uid
