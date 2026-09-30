"""评估运行编排测试（D61）：状态机、逐题落库、失败隔离与聚合。

用替身替换 dao 与逐题评估，覆盖编排语义而非库行为。重点在三条口径：

- 已非 ``pending`` 的 run 直接跳过（Celery at-least-once 下靠状态机防重跑）
- 单题失败**不中断**整次运行，且失败题的 metrics 不参与聚合
- 编排异常 → 落 ``failed`` 终态后再抛（终态必须留下，否则 run 永远卡在 running）
"""

from __future__ import annotations

import asyncio

from typing import Any

import pytest

from backend.src.app.evaluation.service import run_service


class _Run:
    def __init__(self, *, dataset_id: str | None = 'ds-1', judge_spec: str = '') -> None:
        self.run_id = 'run-1'
        self.kb_name = 'dev'
        self.dataset_id = dataset_id
        self.judge_spec = judge_spec
        self.retrieval_config = {'search_mode': 'keyword'}
        self.completed_items = 0


class _Item:
    def __init__(self, query_text: str, gold_answer: str | None = '答') -> None:
        self.query_text = query_text
        self.gold_chunk_ids = ['c1']
        self.gold_answer = gold_answer


class _Session:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


class _RunDao:
    def __init__(self, run: _Run | None, *, can_start: bool = True) -> None:
        self.run = run
        self.can_start = can_start
        self.appended: list[dict[str, Any]] = []
        self.finished: dict[str, Any] | None = None

    async def get_run(self, db: Any, run_id: str, *, plugin_namespace: str | None = None) -> _Run | None:
        return self.run

    async def mark_running(self, db: Any, run_id: str, *, plugin_namespace: str | None = None) -> bool:
        return self.can_start

    async def append_item(self, db: Any, run_id: str, **kwargs: Any) -> None:
        self.appended.append(kwargs)

    async def finish(self, db: Any, run_id: str, **kwargs: Any) -> None:
        self.finished = kwargs


class _DatasetDao:
    def __init__(self, items: list[_Item]) -> None:
        self.items = items

    async def list_items(self, db: Any, dataset_id: str, *, plugin_namespace: str | None = None) -> list[_Item]:
        return self.items


def _patch(
    monkeypatch: pytest.MonkeyPatch,
    *,
    run: _Run | None,
    items: list[_Item],
    can_start: bool = True,
    evaluator: Any = None,
) -> _RunDao:
    run_dao = _RunDao(run, can_start=can_start)
    monkeypatch.setattr(run_service, 'eval_run_dao', run_dao)
    monkeypatch.setattr(run_service, 'eval_dataset_dao', _DatasetDao(items))
    monkeypatch.setattr(run_service, '_resolve_judge', lambda db, spec: _noop())
    if evaluator is not None:
        monkeypatch.setattr(run_service, 'evaluate_item', evaluator)
    return run_dao


def _as_session(session: _Session) -> Any:
    """假会话以 Any 传入：编排形参声明为 AsyncSession，替身无需真的满足它。"""
    return session


async def _noop() -> None:  # ruff: ignore[unused-async]
    return None


def _result(metrics: dict[str, Any], *, error: str | None = None) -> dict[str, Any]:
    return {
        'query_text': 'q',
        'gold_chunk_ids': ['c1'],
        'gold_answer': '答',
        'generated_answer': 'a',
        'retrieved_chunk_ids': ['c1'],
        'citations': [{'chunk_id': 'c1'}],
        'usage': {},
        'metrics': metrics,
        'error_message': error,
    }


def _execute(monkeypatch: pytest.MonkeyPatch, **kwargs: Any) -> tuple[dict[str, Any], _Session]:
    session = _Session()
    result = asyncio.run(run_service.execute_run(_as_session(session), run_id='run-1', **kwargs))
    return result, session


# ------------------------------------------------------------------ 状态机
def test_missing_run_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch(monkeypatch, run=None, items=[])
    result, _ = _execute(monkeypatch)
    assert result['status'] == 'missing'


def test_non_pending_run_is_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    """重复投递不重跑：靠状态机而非锁。"""
    _patch(monkeypatch, run=_Run(), items=[_Item('q')], can_start=False)
    result, _ = _execute(monkeypatch)
    assert result['status'] == 'skipped'


def test_empty_dataset_fails_loudly(monkeypatch: pytest.MonkeyPatch) -> None:
    run_dao = _patch(monkeypatch, run=_Run(), items=[])
    result, _ = _execute(monkeypatch)
    assert result['status'] == 'failed'
    assert run_dao.finished is not None
    assert '没有题目' in str(run_dao.finished['error_message'])


# ------------------------------------------------------------------ 正常跑完
def test_completes_and_aggregates(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_eval(db: Any, **kwargs: Any) -> dict[str, Any]:  # ruff: ignore[unused-async]
        return _result({'recall@10': 1.0, 'score': 1.0, 'judged': True})

    run_dao = _patch(monkeypatch, run=_Run(), items=[_Item('q1'), _Item('q2')], evaluator=fake_eval)
    result, session = _execute(monkeypatch)
    assert result['status'] == 'completed'
    assert result['completed_items'] == 2
    assert result['overall_score'] == pytest.approx(1.0)
    assert run_dao.finished is not None
    # judged 是布尔，不进聚合；score/recall 取均值
    assert run_dao.finished['metrics']['score'] == pytest.approx(1.0)
    assert 'judged' not in run_dao.finished['metrics']
    assert session.commits >= 2  # 逐题落库 + 终态


def test_each_item_is_persisted_with_its_metrics(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_eval(db: Any, **kwargs: Any) -> dict[str, Any]:  # ruff: ignore[unused-async]
        return _result({'recall@10': 0.5})

    run_dao = _patch(monkeypatch, run=_Run(), items=[_Item('q1')], evaluator=fake_eval)
    _execute(monkeypatch)
    assert len(run_dao.appended) == 1
    assert run_dao.appended[0]['metrics'] == {'recall@10': 0.5}
    assert run_dao.appended[0]['item_index'] == 0


def test_failed_item_does_not_dilute_average(monkeypatch: pytest.MonkeyPatch) -> None:
    """失败题 metrics 为空 → 不参与分母（与 Judge 未判定同口径）。"""
    calls = {'n': 0}

    async def fake_eval(db: Any, **kwargs: Any) -> dict[str, Any]:  # ruff: ignore[unused-async]
        calls['n'] += 1
        return _result({}, error='boom') if calls['n'] == 1 else _result({'recall@10': 1.0})

    run_dao = _patch(monkeypatch, run=_Run(), items=[_Item('q1'), _Item('q2')], evaluator=fake_eval)
    result, _ = _execute(monkeypatch)
    assert result['status'] == 'completed'
    assert result['completed_items'] == 2
    assert run_dao.finished is not None
    assert run_dao.finished['metrics']['recall@10'] == pytest.approx(1.0)


# ------------------------------------------------------------------ 编排异常
def test_orchestration_error_marks_failed_then_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """终态必须先落下再抛：否则 run 永远卡在 running，没人能收敛它。"""

    async def boom(db: Any, **kwargs: Any) -> dict[str, Any]:  # ruff: ignore[unused-async]
        raise RuntimeError('evaluator exploded')

    run_dao = _patch(monkeypatch, run=_Run(), items=[_Item('q1')], evaluator=boom)
    with pytest.raises(RuntimeError):
        _execute(monkeypatch)
    assert run_dao.finished is not None
    assert run_dao.finished['status'] == 'failed'
    assert 'evaluator exploded' in str(run_dao.finished['error_message'])
