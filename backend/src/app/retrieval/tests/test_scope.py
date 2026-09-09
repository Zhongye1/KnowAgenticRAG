"""Scope 构建与 Milvus 表达式生成单元测试（agent-layer spec ACL 设计）。

覆盖：
- Scope / UserContext 数据类
- validate_ids_for_expr 白名单校验
- to_milvus_expr 表达式生成（namespace + 文档级 ACL，kb_name 由 milvus 层注入）
"""

from __future__ import annotations

import pytest

from backend.src.app.retrieval.service.scope import (
    Scope,
    UserContext,
    to_milvus_expr,
    validate_ids_for_expr,
)


class TestValidateIdsForExpr:
    """ID 白名单校验测试。"""

    def test_valid_ids(self) -> None:
        """合法 ID 应通过校验。"""
        validate_ids_for_expr(['kb1', 'user-123', 'group_456'], 'test')

    def test_empty_list(self) -> None:
        """空列表应通过校验。"""
        validate_ids_for_expr([], 'test')

    def test_invalid_id_with_spaces(self) -> None:
        """包含空格的 ID 应抛出异常。"""
        with pytest.raises(ValueError, match='非法字符'):
            validate_ids_for_expr(['kb 1'], 'test')

    def test_invalid_id_with_special_chars(self) -> None:
        """包含特殊字符的 ID 应抛出异常。"""
        with pytest.raises(ValueError, match='非法字符'):
            validate_ids_for_expr(['kb;DROP TABLE'], 'test')

    def test_invalid_id_with_injection(self) -> None:
        """包含 SQL 注入的 ID 应抛出异常。"""
        with pytest.raises(ValueError, match='非法字符'):
            validate_ids_for_expr(['kb" or "1"="1'], 'test')

    def test_too_many_ids(self) -> None:
        """超过数量限制应抛出异常。"""
        with pytest.raises(ValueError, match='数量超限'):
            validate_ids_for_expr(['id'] * 201, 'test')


class TestToMilvusExpr:
    """Milvus 表达式生成测试。

    注意：kb_name 过滤由 search_ragf_kb() 在 Milvus 层注入（单 KB per call），
    to_milvus_expr 只生成 namespace + 文档级 ACL 表达式。
    """

    def test_basic_scope(self) -> None:
        """基础 Scope 应生成 namespace + 文档级 ACL 表达式。"""
        scope = Scope(
            namespace='core',
            user_id='user1',
            groups=['group1', 'group2'],
            allowed_kbs=['kb1', 'kb2'],
        )
        expr = to_milvus_expr(scope)

        assert 'namespace == "core"' in expr
        assert 'visibility == "public"' in expr
        assert 'owner_id == "user1"' in expr
        assert 'array_contains_any(groups, ["group1","group2"])' in expr
        # kb_name 过滤不在 scope 表达式中（由 milvus 层注入）
        assert 'kb_name' not in expr
        assert 'kb_id' not in expr

    def test_no_allowed_kbs(self) -> None:
        """无权限访问任何 KB 时应返回拒绝表达式。"""
        scope = Scope(
            namespace='core',
            user_id='user1',
            groups=[],
            allowed_kbs=[],
        )
        expr = to_milvus_expr(scope)

        assert 'namespace == "__no_access__"' in expr

    def test_no_groups(self) -> None:
        """无组信息时不应包含 groups 过滤。"""
        scope = Scope(
            namespace='core',
            user_id='user1',
            groups=[],
            allowed_kbs=['kb1'],
        )
        expr = to_milvus_expr(scope)

        assert 'array_contains_any' not in expr
        assert 'visibility == "public"' in expr
        assert 'owner_id == "user1"' in expr

    def test_no_user_id(self) -> None:
        """无用户 ID 时不应包含 owner_id 过滤。"""
        scope = Scope(
            namespace='core',
            user_id='',
            groups=['group1'],
            allowed_kbs=['kb1'],
        )
        expr = to_milvus_expr(scope)

        assert 'owner_id' not in expr
        assert 'visibility == "public"' in expr
        assert 'array_contains_any(groups, ["group1"])' in expr

    def test_single_group(self) -> None:
        """单个组应正确生成表达式。"""
        scope = Scope(
            namespace='prod',
            user_id='admin',
            groups=['admins'],
            allowed_kbs=['knowledge'],
        )
        expr = to_milvus_expr(scope)

        assert 'namespace == "prod"' in expr
        assert 'array_contains_any(groups, ["admins"])' in expr


class TestScopeDataclass:
    """Scope 数据类测试。"""

    def test_frozen(self) -> None:
        """Scope 应为不可变对象。"""
        scope = Scope(
            namespace='core',
            user_id='user1',
            groups=[],
            allowed_kbs=[],
        )
        # 故意赋值，验证 frozen dataclass 运行时抛出 AttributeError
        with pytest.raises(AttributeError):
            scope.namespace = 'other'  # pyright: ignore[reportAttributeAccessIssue]

    def test_defaults(self) -> None:
        """Scope 应有默认值。"""
        scope = Scope(
            namespace='core',
            user_id='user1',
        )
        assert scope.groups == []
        assert scope.allowed_kbs == []


class TestUserContextDataclass:
    """UserContext 数据类测试。"""

    def test_frozen(self) -> None:
        """UserContext 应为不可变对象。"""
        ctx = UserContext(user_id='user1', namespace='core', dept_id=1)
        # 故意赋值，验证 frozen dataclass 运行时抛出 AttributeError
        with pytest.raises(AttributeError):
            ctx.user_id = 'other'  # pyright: ignore[reportAttributeAccessIssue]

    def test_dept_id_optional(self) -> None:
        """dept_id 应有默认值 None。"""
        ctx = UserContext(user_id='user1', namespace='core')
        assert ctx.dept_id is None

    def test_full_context(self) -> None:
        """完整上下文应正确构造。"""
        ctx = UserContext(user_id='user1', namespace='core', dept_id=42)
        assert ctx.user_id == 'user1'
        assert ctx.namespace == 'core'
        assert ctx.dept_id == 42
