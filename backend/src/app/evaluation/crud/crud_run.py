"""评估运行 CRUD（RAG 清单 Phase 4 / D61）。

状态机刻意保持极简（``pending → running → completed/failed``）：与 ingest 的七态
不同，评估没有"分阶段落库"的需要——逐题结果本身就是进度，``completed_items`` 由
逐题写入时递增，不必再引入中间态。
"""

from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.evaluation.model import EVAL_RUN_TERMINAL_STATUSES, EvalRun, EvalRunItem
from backend.src.app.kb.crud.base import TenantScopedCrud, result_rowcount
from backend.src.app.kb.utils.namespace import instance_namespace
from backend.src.utils.timezone import timezone

__all__ = ['CRUDEvalRun', 'eval_run_dao']


class CRUDEvalRun(TenantScopedCrud[EvalRun]):
    """评估运行与逐题结果。"""

    async def create_run(
        self,
        db: AsyncSession,
        *,
        run_id: str,
        kb_name: str,
        dataset_id: str | None,
        name: str,
        retrieval_config: dict,
        judge_spec: str,
        total_items: int,
        created_by: str | None = None,
        plugin_namespace: str | None = None,
    ) -> EvalRun:
        """建运行行（``pending``；派发任务后由 ``mark_running`` 转 ``running``）。

        ``retrieval_config`` / ``judge_spec`` 是**快照**：改 KB 参数后重跑，历史 run
        仍可解释当时结果。
        """
        obj = EvalRun(
            run_id=run_id,
            plugin_namespace=instance_namespace(plugin_namespace),
            kb_name=kb_name,
            dataset_id=dataset_id,
            name=name,
            status='pending',
            retrieval_config=dict(retrieval_config or {}),
            judge_spec=judge_spec,
            total_items=max(int(total_items), 0),
            created_by=created_by,
        )
        db.add(obj)
        await db.flush()
        return obj

    async def get_run(self, db: AsyncSession, run_id: str, *, plugin_namespace: str | None = None) -> EvalRun | None:
        return await self.select_scoped(db, plugin_namespace=plugin_namespace, run_id=run_id)

    async def list_runs(
        self,
        db: AsyncSession,
        *,
        kb_name: str | None = None,
        dataset_id: str | None = None,
        plugin_namespace: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[EvalRun], int]:
        """分页列运行（按开始时间倒序）。"""
        ns = instance_namespace(plugin_namespace)
        filters = [EvalRun.plugin_namespace == ns]
        if kb_name is not None:
            filters.append(EvalRun.kb_name == kb_name)
        if dataset_id is not None:
            filters.append(EvalRun.dataset_id == dataset_id)
        total = int((await db.scalar(select(func.count()).select_from(EvalRun).where(*filters))) or 0)
        stmt = (
            select(EvalRun)
            .where(*filters)
            .order_by(EvalRun.started_time.desc())
            .offset(max(offset, 0))
            .limit(max(limit, 1))
        )
        rows = list((await db.execute(stmt)).scalars().all())
        return rows, total

    async def mark_running(self, db: AsyncSession, run_id: str, *, plugin_namespace: str | None = None) -> bool:
        """``pending → running``；非 pending 返回 False（重复投递不重跑）。"""
        obj = await self.get_run(db, run_id, plugin_namespace=plugin_namespace)
        if obj is None or obj.status != 'pending':
            return False
        obj.status = 'running'
        await db.flush()
        return True

    async def append_item(
        self,
        db: AsyncSession,
        run_id: str,
        *,
        item_index: int,
        query_text: str,
        gold_chunk_ids: list,
        gold_answer: str | None,
        generated_answer: str | None,
        retrieved_chunk_ids: list,
        citations: list,
        usage: dict,
        metrics: dict,
        error_message: str | None = None,
        plugin_namespace: str | None = None,
    ) -> EvalRunItem:
        """写一条逐题结果并递增进度（逐题落库使中途失败也保留已完成的部分）。"""
        ns = instance_namespace(plugin_namespace)
        obj = EvalRunItem(
            result_id=f'{run_id}:{item_index}',
            run_id=run_id,
            plugin_namespace=ns,
            item_index=item_index,
            query_text=query_text,
            gold_chunk_ids=list(gold_chunk_ids or []),
            gold_answer=gold_answer,
            generated_answer=generated_answer,
            retrieved_chunk_ids=list(retrieved_chunk_ids or []),
            citations=list(citations or []),
            usage=dict(usage or {}),
            metrics=dict(metrics or {}),
            error_message=error_message,
        )
        db.add(obj)
        run = await self.get_run(db, run_id, plugin_namespace=plugin_namespace)
        if run is not None and run.status not in EVAL_RUN_TERMINAL_STATUSES:
            run.completed_items = int(run.completed_items or 0) + 1
        await db.flush()
        return obj

    async def list_items(
        self, db: AsyncSession, run_id: str, *, plugin_namespace: str | None = None
    ) -> list[EvalRunItem]:
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(EvalRunItem)
            .where(EvalRunItem.run_id == run_id, EvalRunItem.plugin_namespace == ns)
            .order_by(EvalRunItem.item_index.asc())
        )
        return list((await db.execute(stmt)).scalars().all())

    async def finish(
        self,
        db: AsyncSession,
        run_id: str,
        *,
        status: str,
        metrics: dict | None = None,
        overall_score: float | None = None,
        error_message: str | None = None,
        plugin_namespace: str | None = None,
    ) -> None:
        """落终态（``completed``/``failed``）。

        已是终态则**不覆盖**：并发或重复投递不应把先到的结果改写成后到的。
        """
        obj = await self.get_run(db, run_id, plugin_namespace=plugin_namespace)
        if obj is None or obj.status in EVAL_RUN_TERMINAL_STATUSES:
            return
        obj.status = status
        if metrics is not None:
            obj.metrics = dict(metrics)
        if overall_score is not None:
            obj.overall_score = float(overall_score)
        if error_message is not None:
            obj.error_message = error_message
        obj.completed_time = timezone.now()
        await db.flush()

    async def delete_run(self, db: AsyncSession, run_id: str, *, plugin_namespace: str | None = None) -> int:
        """删运行（逐题结果随 CASCADE 删除）。"""
        obj = await self.get_run(db, run_id, plugin_namespace=plugin_namespace)
        if obj is None:
            return 0
        await db.delete(obj)
        await db.flush()
        return 1

    async def count_by_kb(self, db: AsyncSession, kb_name: str, *, plugin_namespace: str | None = None) -> int:
        return await self.count_scoped(db, plugin_namespace=plugin_namespace, kb_name=kb_name)

    async def latest_started_time(
        self, db: AsyncSession, kb_name: str, *, plugin_namespace: str | None = None
    ) -> datetime | None:
        """KB 下最近一次评估开始时间（管理面板用）。"""
        ns = instance_namespace(plugin_namespace)
        return await db.scalar(
            select(func.max(EvalRun.started_time)).where(EvalRun.plugin_namespace == ns, EvalRun.kb_name == kb_name)
        )

    async def delete_by_kb(self, db: AsyncSession, kb_name: str, *, plugin_namespace: str | None = None) -> int:
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(delete(EvalRun).where(EvalRun.plugin_namespace == ns, EvalRun.kb_name == kb_name))
        await db.flush()
        return result_rowcount(result)


eval_run_dao = CRUDEvalRun(EvalRun)
