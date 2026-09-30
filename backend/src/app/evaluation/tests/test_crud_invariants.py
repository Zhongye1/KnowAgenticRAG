"""评估域 CRUD 不变量测试（D61）：租户过滤、幂等重建、终态不可覆盖。

不连数据库——两条路径各自覆盖：

1. **租户过滤**用编译级 SQL 断言（同 ``kb/tests/test_document_dao_filters.py`` 的思路）：
   租户条件是隔离边界，一旦漏注入就是跨租户可见，且在有数据的集成测试里未必暴露；
2. **状态迁移**用替身对象直接验证语义（``pending`` 才可转 ``running``、终态不覆盖），
   这类"并发下先到的结果不能被后到的改写"的性质在真库上也难稳定复现。
"""

from __future__ import annotations

import asyncio

from typing import Any

import pytest

from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.selectable import Select

from backend.src.app.evaluation.crud import eval_dataset_dao, eval_run_dao
from backend.src.app.evaluation.model import EvalRun


class _CapturedSession:
    """捕获编译后 SQL 的假会话（不连库）。"""

    def __init__(self) -> None:
        self.sql: str | None = None

    async def execute(self, statement: Any) -> Any:
        assert isinstance(statement, Select)
        self.sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={'literal_binds': True}))
        outer = self

        class _Scalars:
            @staticmethod
            def first() -> None:
                return None

            @staticmethod
            def all() -> list[Any]:
                return []

        class _Result:
            @staticmethod
            def scalars() -> _Scalars:
                return _Scalars()

        _ = outer
        return _Result()


def _compiled(coro: Any) -> str:
    session = _CapturedSession()
    asyncio.run(coro(session))
    assert session.sql is not None
    return session.sql


# ------------------------------------------------------------------ 租户过滤
def test_get_dataset_filters_by_tenant() -> None:
    sql = _compiled(lambda s: eval_dataset_dao.get_dataset(s, 'ds-1', plugin_namespace='core'))
    assert 'plugin_namespace' in sql
    assert 'dataset_id' in sql


def test_get_run_filters_by_tenant() -> None:
    sql = _compiled(lambda s: eval_run_dao.get_run(s, 'run-1', plugin_namespace='core'))
    assert 'plugin_namespace' in sql
    assert 'run_id' in sql


# ------------------------------------------------------------------ 状态迁移
def _stub_run(status: str, completed: int = 0) -> EvalRun:
    run = EvalRun(run_id='run-1', kb_name='dev', plugin_namespace='core', status=status)
    run.completed_items = completed
    return run


class _Session:
    """最小假会话：只提供 CRUD 用到的 add/flush/execute。"""

    def __init__(self) -> None:
        self.flushes = 0
        self.added: list[Any] = []

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def add_all(self, objects: Any) -> None:
        self.added.extend(objects)

    async def flush(self) -> None:
        self.flushes += 1

    async def execute(self, statement: Any) -> Any:
        return None


def _session() -> Any:
    """假会话以 Any 传入：CRUD 形参声明为 AsyncSession，测试替身无需真的满足它。"""
    return _Session()


def _patch_run(monkeypatch: Any, run: EvalRun | None) -> None:
    """把 ``get_run`` 换成返回替身（状态迁移逻辑与库无关）。"""

    async def fake_get(  # ruff: ignore[unused-async]
        db: Any, run_id: str, *, plugin_namespace: str | None = None
    ) -> EvalRun | None:
        return run

    monkeypatch.setattr(eval_run_dao, 'get_run', fake_get)


def test_mark_running_only_from_pending(monkeypatch: Any) -> None:
    """重复投递不应把已在跑的 run 重置（幂等派发）。"""
    _patch_run(monkeypatch, _stub_run('pending'))
    assert asyncio.run(eval_run_dao.mark_running(_session(), 'run-1')) is True

    _patch_run(monkeypatch, _stub_run('running'))
    assert asyncio.run(eval_run_dao.mark_running(_session(), 'run-1')) is False


def test_finish_does_not_overwrite_terminal_status(monkeypatch: Any) -> None:
    """已是终态则不改写：并发下"先到的结果"不能被"后到的"覆盖。"""
    run = _stub_run('completed')
    _patch_run(monkeypatch, run)
    asyncio.run(eval_run_dao.finish(_session(), 'run-1', status='failed', error_message='late'))
    assert run.status == 'completed'
    assert run.error_message is None


def test_finish_writes_terminal_fields(monkeypatch: Any) -> None:
    run = _stub_run('running')
    _patch_run(monkeypatch, run)
    asyncio.run(
        eval_run_dao.finish(_session(), 'run-1', status='completed', metrics={'recall@10': 0.5}, overall_score=0.5)
    )
    assert run.status == 'completed'
    assert run.metrics == {'recall@10': 0.5}
    assert run.overall_score == pytest.approx(0.5)
    assert run.completed_time is not None


def test_append_item_does_not_bump_progress_after_terminal(monkeypatch: Any) -> None:
    """终态后到达的逐题结果可以留档，但不该再把进度往前推。"""
    run = _stub_run('completed', completed=3)
    _patch_run(monkeypatch, run)
    asyncio.run(
        eval_run_dao.append_item(
            _session(),
            'run-1',
            item_index=3,
            query_text='q',
            gold_chunk_ids=[],
            gold_answer=None,
            generated_answer='a',
            retrieved_chunk_ids=[],
            citations=[],
            usage={},
            metrics={},
        )
    )
    assert run.completed_items == 3


# ------------------------------------------------------------------ 幂等重建
def test_replace_items_deletes_before_insert() -> None:
    """重建数据集是整体替换：先删旧题再写新题，不做增量合并。"""
    statements: list[str] = []

    class _Recorder:
        async def execute(self, statement: Any) -> None:
            statements.append(str(statement.compile(dialect=postgresql.dialect())))

        def add_all(self, objects: Any) -> None:
            statements.append(f'INSERT {len(list(objects))}')

        async def flush(self) -> None:
            pass

    def _recorder() -> Any:
        return _Recorder()

    written = asyncio.run(
        eval_dataset_dao.replace_items(
            _recorder(),
            'ds-1',
            kb_name='dev',
            items=[{'query_text': 'q1', 'gold_chunk_ids': ['c1']}, {'query_text': 'q2'}],
        )
    )
    assert written == 2
    assert statements[0].upper().startswith('DELETE'), '必须先删旧题'
    assert statements[1] == 'INSERT 2'
