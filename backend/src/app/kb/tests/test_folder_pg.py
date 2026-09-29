"""文件夹真实 PostgreSQL 集成测试（kb-落地改造清单 Phase 1 出口条件）。

覆盖 D51 的三条硬语义：
1. **同级重名** → ConflictError；
2. **环检测** → 不能移到自身或自身子孙；
3. **删除上浮** → 子文件夹与文档改挂到**父级**（而非根目录，也非级联删除）。

另覆盖跨知识库隔离（他库 folder_id → 404）。每次操作在独立会话内 flush 但不
commit，会话关闭即回滚，不留残留；DB 不可达时整模块跳过。

参数对象统一走 `model_validate({...})`：`SchemaBase` 子类的 `Field(None, ...)`
默认值 pyright 推断不出（仓库既有限制），构造器写法会报 reportCallIssue，
既有 PG 测试（`test_kb_owner_pg.py`）同样用 model_validate 规避。
"""

from __future__ import annotations

import asyncio

from typing import TYPE_CHECKING, Any

import pytest

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.src.app.kb.crud import document_dao, folder_dao
from backend.src.app.kb.schema.folder import FolderCreateParam, FolderMoveParam, FolderUpdateParam
from backend.src.app.kb.service.folder_service import folder_service
from backend.src.app.kb.tests.pg_schema import ensure_test_database, reset_test_schema
from backend.src.common.exception import errors
from backend.src.database.db import get_database_url

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

KB = 'folder_pg_kb'
OTHER_KB = 'folder_pg_kb_other'


def _create(name: str, parent_id: str | None = None) -> FolderCreateParam:
    return FolderCreateParam.model_validate({'name': name, 'parent_id': parent_id})


def _move(parent_id: str | None) -> FolderMoveParam:
    return FolderMoveParam.model_validate({'parent_id': parent_id})


def _rename(name: str) -> FolderUpdateParam:
    return FolderUpdateParam.model_validate({'name': name})


@pytest.fixture(scope='module', autouse=True)
def _pg_integration_env() -> Any:
    """跳过条件 + 建表：DB 不可达则整模块 skip。"""
    try:
        asyncio.run(_ensure_test_db())
    except Exception as exc:  # pragma: no cover - 本地环境相关
        pytest.skip(f'真实 PG 不可达，跳过集成测试: {exc}')
    # 确保模型注册到 MappedBase.metadata（kb_folders 由 create_all 落库）
    import backend.src.app.kb.model.folder  # ruff: ignore[unused-import]

    engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
    asyncio.run(_prepare_schema(engine))
    asyncio.run(engine.dispose())


async def _ensure_test_db() -> None:
    """委托共享助手（定义见 `pg_schema.py`）。"""
    await ensure_test_database()


async def _prepare_schema(engine: AsyncEngine) -> None:
    """委托共享助手：按模型元数据重建全部业务表（见 `pg_schema.py`）。"""
    await reset_test_schema(engine)


def _run(case: Any) -> Any:
    """在独立引擎/会话内跑一段协程，结束后回滚（无残留）。"""

    async def _runner() -> Any:
        engine = create_async_engine(get_database_url(unittest=True), poolclass=NullPool)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as session:
                return await case(session)
        finally:
            await engine.dispose()

    return asyncio.run(_runner())


def test_same_level_name_conflict_rejected() -> None:
    async def _case(session: Any) -> str:
        await folder_service.create(db=session, kb_name=KB, obj=_create('重名目录'))
        with pytest.raises(errors.ConflictError):
            await folder_service.create(db=session, kb_name=KB, obj=_create('重名目录'))
        return 'ok'

    assert _run(_case) == 'ok'


def test_same_name_allowed_under_different_parents() -> None:
    async def _case(session: Any) -> str:
        parent = await folder_service.create(db=session, kb_name=KB, obj=_create('同名父'))
        await folder_service.create(db=session, kb_name=KB, obj=_create('同名子'))
        # 与上面根级「同名子」同名，但父级不同 → 允许
        await folder_service.create(db=session, kb_name=KB, obj=_create('同名子', parent['folder_id']))
        return 'ok'

    assert _run(_case) == 'ok'


def test_rename_to_existing_sibling_name_rejected() -> None:
    async def _case(session: Any) -> str:
        await folder_service.create(db=session, kb_name=KB, obj=_create('改甲'))
        second = await folder_service.create(db=session, kb_name=KB, obj=_create('改乙'))
        with pytest.raises(errors.ConflictError):
            await folder_service.update(db=session, kb_name=KB, folder_id=second['folder_id'], obj=_rename('改甲'))
        return 'ok'

    assert _run(_case) == 'ok'


def test_rename_to_own_name_allowed() -> None:
    """改成一个与自己相同的名字不应触发同级冲突（exclude 自身）。"""

    async def _case(session: Any) -> str:
        node = await folder_service.create(db=session, kb_name=KB, obj=_create('自名'))
        result = await folder_service.update(db=session, kb_name=KB, folder_id=node['folder_id'], obj=_rename('自名'))
        return str(result['name'])

    assert _run(_case) == '自名'


def test_move_into_self_rejected() -> None:
    async def _case(session: Any) -> str:
        node = await folder_service.create(db=session, kb_name=KB, obj=_create('自身'))
        with pytest.raises(errors.RequestError):
            await folder_service.move(db=session, kb_name=KB, folder_id=node['folder_id'], obj=_move(node['folder_id']))
        return 'ok'

    assert _run(_case) == 'ok'


def test_move_into_own_descendant_rejected() -> None:
    """环检测核心用例：A → B → C，把 A 移到 C 下应被拒。"""

    async def _case(session: Any) -> str:
        a = await folder_service.create(db=session, kb_name=KB, obj=_create('环-A'))
        b = await folder_service.create(db=session, kb_name=KB, obj=_create('环-B', a['folder_id']))
        c = await folder_service.create(db=session, kb_name=KB, obj=_create('环-C', b['folder_id']))
        with pytest.raises(errors.RequestError):
            await folder_service.move(db=session, kb_name=KB, folder_id=a['folder_id'], obj=_move(c['folder_id']))
        return 'ok'

    assert _run(_case) == 'ok'


def test_move_into_direct_child_rejected() -> None:
    async def _case(session: Any) -> str:
        parent = await folder_service.create(db=session, kb_name=KB, obj=_create('直-A'))
        child = await folder_service.create(db=session, kb_name=KB, obj=_create('直-B', parent['folder_id']))
        with pytest.raises(errors.RequestError):
            await folder_service.move(
                db=session, kb_name=KB, folder_id=parent['folder_id'], obj=_move(child['folder_id'])
            )
        return 'ok'

    assert _run(_case) == 'ok'


def test_move_into_own_subtree_sibling_allowed() -> None:
    """非子孙的兄弟节点之间可以移动（环检测不能误伤）。"""

    async def _case(session: Any) -> str | None:
        left = await folder_service.create(db=session, kb_name=KB, obj=_create('兄'))
        right = await folder_service.create(db=session, kb_name=KB, obj=_create('弟'))
        moved = await folder_service.move(
            db=session, kb_name=KB, folder_id=right['folder_id'], obj=_move(left['folder_id'])
        )
        return str(moved['parent_id'])

    assert _run(_case) is not None


def test_delete_promotes_children_to_parent_not_root() -> None:
    """R(root) → A → B；A 下挂文档 E、B 下挂文档 D。删 A：
    B 与 E 都上浮到 **R**（不是根，也不是被级联删除），D 留在 B。"""

    async def _case(session: Any) -> tuple[Any, ...]:
        r = await folder_service.create(db=session, kb_name=KB, obj=_create('R'))
        a = await folder_service.create(db=session, kb_name=KB, obj=_create('A', r['folder_id']))
        b = await folder_service.create(db=session, kb_name=KB, obj=_create('B', a['folder_id']))
        doc_e = await document_dao.create(session, document_id='doc-e', kb_name=KB, name='E.md')
        doc_d = await document_dao.create(session, document_id='doc-d', kb_name=KB, name='D.md')
        await folder_service.move_document(
            db=session, kb_name=KB, document_id=doc_e.document_id, folder_id=a['folder_id']
        )
        await folder_service.move_document(
            db=session, kb_name=KB, document_id=doc_d.document_id, folder_id=b['folder_id']
        )

        report = await folder_service.delete(db=session, kb_name=KB, folder_id=a['folder_id'])

        node_b = await folder_dao.select_scoped(session, plugin_namespace=None, folder_id=b['folder_id'])
        moved_e = await document_dao.get(session, 'doc-e')
        kept_d = await document_dao.get(session, 'doc-d')
        gone_a = await folder_dao.select_scoped(session, plugin_namespace=None, folder_id=a['folder_id'])
        return (
            report['promoted_folders'],
            report['promoted_documents'],
            node_b.parent_id if node_b else None,
            moved_e.folder_id if moved_e else None,
            kept_d.folder_id if kept_d else None,
            gone_a,
            r['folder_id'],
        )

    promoted_folders, promoted_docs, b_parent, e_folder, d_folder, gone_a, root_id = _run(_case)

    assert promoted_folders == 1
    assert promoted_docs == 1
    assert b_parent == root_id  # B 上浮到 A 的父级 R
    assert e_folder == root_id  # A 下的文档上浮到 R
    assert d_folder != root_id  # B 下的文档留在 B，未被连带移动
    assert gone_a is None  # A 已删除


def test_delete_leaf_promotes_nothing() -> None:
    async def _case(session: Any) -> tuple[int, int]:
        leaf = await folder_service.create(db=session, kb_name=KB, obj=_create('叶子'))
        report = await folder_service.delete(db=session, kb_name=KB, folder_id=leaf['folder_id'])
        return report['promoted_folders'], report['promoted_documents']

    assert _run(_case) == (0, 0)


def test_folder_of_other_kb_is_invisible() -> None:
    """跨知识库隔离：他库 folder_id 在本库上下文中不可见（404 语义）。"""

    async def _case(session: Any) -> str:
        other = await folder_service.create(db=session, kb_name=OTHER_KB, obj=_create('他库'))
        with pytest.raises(errors.NotFoundError):
            await folder_service.create(db=session, kb_name=KB, obj=_create('越界', other['folder_id']))
        return 'ok'

    assert _run(_case) == 'ok'


def test_move_document_to_other_kb_folder_rejected() -> None:
    async def _case(session: Any) -> str:
        other = await folder_service.create(db=session, kb_name=OTHER_KB, obj=_create('他库2'))
        await document_dao.create(session, document_id='doc-x', kb_name=KB, name='X.md')
        with pytest.raises(errors.NotFoundError):
            await folder_service.move_document(
                db=session, kb_name=KB, document_id='doc-x', folder_id=other['folder_id']
            )
        return 'ok'

    assert _run(_case) == 'ok'


def test_list_tree_reports_document_counts() -> None:
    async def _case(session: Any) -> tuple[int, int]:
        parent = await folder_service.create(db=session, kb_name=KB, obj=_create('计数父'))
        child = await folder_service.create(db=session, kb_name=KB, obj=_create('计数子', parent['folder_id']))
        for idx in range(2):
            doc = await document_dao.create(session, document_id=f'cnt-p-{idx}', kb_name=KB, name=f'p{idx}.md')
            await folder_service.move_document(
                db=session, kb_name=KB, document_id=doc.document_id, folder_id=parent['folder_id']
            )
        doc = await document_dao.create(session, document_id='cnt-c-0', kb_name=KB, name='c0.md')
        await folder_service.move_document(
            db=session, kb_name=KB, document_id=doc.document_id, folder_id=child['folder_id']
        )

        tree = await folder_service.list_tree(db=session, kb_name=KB)
        node = next(item for item in tree if item.folder_id == parent['folder_id'])
        return node.document_count, node.children[0].document_count

    assert _run(_case) == (2, 1)


def test_move_document_to_root_clears_folder() -> None:
    async def _case(session: Any) -> str | None:
        folder = await folder_service.create(db=session, kb_name=KB, obj=_create('回根'))
        doc = await document_dao.create(session, document_id='doc-root', kb_name=KB, name='R.md')
        await folder_service.move_document(
            db=session, kb_name=KB, document_id=doc.document_id, folder_id=folder['folder_id']
        )
        await folder_service.move_document(db=session, kb_name=KB, document_id=doc.document_id, folder_id=None)
        refreshed = await document_dao.get(session, 'doc-root')
        return refreshed.folder_id if refreshed else 'missing'

    assert _run(_case) is None
