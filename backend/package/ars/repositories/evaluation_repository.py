from __future__ import annotations

from typing import Any

from sqlalchemy import delete, func, select

from ars.storage.postgres.manager import pg_manager
from ars.storage.postgres.models_knowledge import (
    EvaluationDataset,
    EvaluationDatasetItem,
    EvaluationRun,
    EvaluationRunItem,
)


class EvaluationRepository:
    async def create_dataset(self, dataset_data: dict[str, Any]) -> EvaluationDataset:
        dataset = EvaluationDataset(**dataset_data)
        async with pg_manager.get_async_session_context() as session:
            session.add(dataset)
        return dataset

    async def create_dataset_with_items(
        self, dataset_data: dict[str, Any], items_data: list[dict[str, Any]]
    ) -> EvaluationDataset:
        dataset = EvaluationDataset(**dataset_data)
        items = [EvaluationDatasetItem(**item) for item in items_data]
        async with pg_manager.get_async_session_context() as session:
            session.add(dataset)
            session.add_all(items)
        return dataset

    async def update_dataset(self, dataset_id: str, data: dict[str, Any]) -> EvaluationDataset | None:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id))
            record = result.scalar_one_or_none()
            if record is None:
                return None
            for key, value in data.items():
                setattr(record, key, value)
            return record

    async def add_dataset_items(self, items_data: list[dict[str, Any]]) -> None:
        items = [EvaluationDatasetItem(**item) for item in items_data]
        async with pg_manager.get_async_session_context() as session:
            session.add_all(items)

    async def get_dataset(self, dataset_id: str) -> EvaluationDataset | None:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id))
            return result.scalar_one_or_none()

    async def list_datasets(self, kb_id: str) -> list[EvaluationDataset]:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(
                select(EvaluationDataset)
                .where(EvaluationDataset.kb_id == kb_id)
                .order_by(EvaluationDataset.created_at.desc())
            )
            return list(result.scalars().all())

    async def list_dataset_items(
        self, dataset_id: str, offset: int = 0, limit: int = 100
    ) -> list[EvaluationDatasetItem]:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(
                select(EvaluationDatasetItem)
                .where(EvaluationDatasetItem.dataset_id == dataset_id)
                .order_by(EvaluationDatasetItem.item_index.asc())
                .offset(offset)
                .limit(limit)
            )
            return list(result.scalars().all())

    async def count_dataset_items(self, dataset_id: str) -> int:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(
                select(func.count(EvaluationDatasetItem.id)).where(EvaluationDatasetItem.dataset_id == dataset_id)
            )
            return int(result.scalar() or 0)

    async def list_all_dataset_items(self, dataset_id: str) -> list[EvaluationDatasetItem]:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(
                select(EvaluationDatasetItem)
                .where(EvaluationDatasetItem.dataset_id == dataset_id)
                .order_by(EvaluationDatasetItem.item_index.asc())
            )
            return list(result.scalars().all())

    async def delete_dataset(self, dataset_id: str) -> None:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id))
            record = result.scalar_one_or_none()
            if record is not None:
                await session.delete(record)

    async def create_run(self, data: dict[str, Any]) -> EvaluationRun:
        run = EvaluationRun(**data)
        async with pg_manager.get_async_session_context() as session:
            session.add(run)
        return run

    async def get_run(self, run_id: str) -> EvaluationRun | None:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(select(EvaluationRun).where(EvaluationRun.run_id == run_id))
            return result.scalar_one_or_none()

    async def list_runs(self, kb_id: str) -> list[EvaluationRun]:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(
                select(EvaluationRun).where(EvaluationRun.kb_id == kb_id).order_by(EvaluationRun.started_at.desc())
            )
            return list(result.scalars().all())

    async def update_run(self, run_id: str, data: dict[str, Any]) -> EvaluationRun | None:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(select(EvaluationRun).where(EvaluationRun.run_id == run_id))
            record = result.scalar_one_or_none()
            if record is None:
                return None
            for key, value in data.items():
                setattr(record, key, value)
            return record

    async def delete_run(self, run_id: str) -> None:
        async with pg_manager.get_async_session_context() as session:
            await session.execute(delete(EvaluationRunItem).where(EvaluationRunItem.run_id == run_id))
            result = await session.execute(select(EvaluationRun).where(EvaluationRun.run_id == run_id))
            record = result.scalar_one_or_none()
            if record is not None:
                await session.delete(record)

    async def upsert_run_item(self, run_id: str, item_index: int, data: dict[str, Any]) -> EvaluationRunItem:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(
                select(EvaluationRunItem).where(
                    (EvaluationRunItem.run_id == run_id) & (EvaluationRunItem.item_index == item_index)
                )
            )
            record = result.scalar_one_or_none()
            if record is None:
                record = EvaluationRunItem(run_id=run_id, item_index=item_index, **data)
                session.add(record)
                return record
            for key, value in data.items():
                setattr(record, key, value)
            return record

    async def list_run_items(self, run_id: str, offset: int = 0, limit: int = 100) -> list[EvaluationRunItem]:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(
                select(EvaluationRunItem)
                .where(EvaluationRunItem.run_id == run_id)
                .order_by(EvaluationRunItem.item_index.asc())
                .offset(offset)
                .limit(limit)
            )
            return list(result.scalars().all())

    async def count_run_items(self, run_id: str) -> int:
        async with pg_manager.get_async_session_context() as session:
            result = await session.execute(
                select(func.count(EvaluationRunItem.id)).where(EvaluationRunItem.run_id == run_id)
            )
            return int(result.scalar() or 0)

    async def delete_all(self) -> None:
        async with pg_manager.get_async_session_context() as session:
            await session.execute(delete(EvaluationRunItem))
            await session.execute(delete(EvaluationRun))
            await session.execute(delete(EvaluationDatasetItem))
            await session.execute(delete(EvaluationDataset))
