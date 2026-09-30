"""评估数据集 CRUD（RAG 清单 Phase 4 / D61）。

租户过滤继承 ``TenantScopedCrud``（隔离收口在基类，service 层不自行拼过滤条件）。
``TenantScopedCrud`` 与 ``instance_namespace`` 目前住在 kb 域，但都是**通用**的
多租户设施（``ingest``/``retrieval`` 亦跨域复用）。后续若第三个域再需要，应下沉到
``common/``——本轮不为此改 kb 的 7 个 crud 文件。
"""

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.app.evaluation.model import EvalDataset, EvalDatasetItem
from backend.src.app.kb.crud.base import TenantScopedCrud, result_rowcount
from backend.src.app.kb.utils.namespace import instance_namespace

__all__ = ['CRUDEvalDataset', 'eval_dataset_dao']


class CRUDEvalDataset(TenantScopedCrud[EvalDataset]):
    """评估数据集与题目。"""

    async def create_dataset(
        self,
        db: AsyncSession,
        *,
        dataset_id: str,
        kb_name: str,
        name: str,
        description: str = '',
        created_by: str | None = None,
        plugin_namespace: str | None = None,
    ) -> EvalDataset:
        """建数据集（题目稍后经 ``replace_items`` 写入，两段式避免半成品）。"""
        obj = EvalDataset(
            dataset_id=dataset_id,
            plugin_namespace=instance_namespace(plugin_namespace),
            kb_name=kb_name,
            name=name,
            description=description,
            created_by=created_by,
        )
        db.add(obj)
        await db.flush()
        return obj

    async def get_dataset(
        self, db: AsyncSession, dataset_id: str, *, plugin_namespace: str | None = None
    ) -> EvalDataset | None:
        """按 ID 取数据集（租户不匹配即 None，调用方转 404，不泄露存在性）。"""
        return await self.select_scoped(db, plugin_namespace=plugin_namespace, dataset_id=dataset_id)

    async def list_datasets(
        self,
        db: AsyncSession,
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[EvalDataset], int]:
        """分页列数据集（按创建时间倒序）。"""
        ns = instance_namespace(plugin_namespace)
        filters = [EvalDataset.plugin_namespace == ns]
        if kb_name is not None:
            filters.append(EvalDataset.kb_name == kb_name)
        total = int((await db.scalar(select(func.count()).select_from(EvalDataset).where(*filters))) or 0)
        stmt = (
            select(EvalDataset)
            .where(*filters)
            .order_by(EvalDataset.created_time.desc())
            .offset(max(offset, 0))
            .limit(max(limit, 1))
        )
        rows = list((await db.execute(stmt)).scalars().all())
        return rows, total

    async def delete_dataset(self, db: AsyncSession, dataset_id: str, *, plugin_namespace: str | None = None) -> int:
        """删数据集（题目随外键 CASCADE 一并删）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(
            select(EvalDataset).where(EvalDataset.plugin_namespace == ns, EvalDataset.dataset_id == dataset_id)
        )
        obj = result.scalar_one_or_none()
        if obj is None:
            return 0
        await db.delete(obj)
        await db.flush()
        return 1

    async def replace_items(
        self,
        db: AsyncSession,
        dataset_id: str,
        *,
        kb_name: str,
        items: list[dict],
        plugin_namespace: str | None = None,
    ) -> int:
        """幂等替换数据集题目（先删旧题再写新题），返回写入数。

        与 ``chunks`` 的 ``replace_by_document`` 同思路：重建数据集是整体替换语义，
        增量合并会让「题目序号」这类稳定标识产生歧义。
        """
        ns = instance_namespace(plugin_namespace)
        await db.execute(
            delete(EvalDatasetItem).where(
                EvalDatasetItem.dataset_id == dataset_id,
                EvalDatasetItem.plugin_namespace == ns,
            )
        )
        await db.flush()
        objects = [
            EvalDatasetItem(
                item_id=f'{dataset_id}:{index}',
                dataset_id=dataset_id,
                plugin_namespace=ns,
                kb_name=kb_name,
                item_index=index,
                query_text=str(item.get('query_text') or ''),
                gold_chunk_ids=list(item.get('gold_chunk_ids') or []),
                gold_answer=item.get('gold_answer'),
            )
            for index, item in enumerate(items)
        ]
        if objects:
            db.add_all(objects)
            await db.flush()
        return len(objects)

    async def list_items(
        self, db: AsyncSession, dataset_id: str, *, plugin_namespace: str | None = None
    ) -> list[EvalDatasetItem]:
        """按序号升序列出题目（评估按此顺序跑，序号稳定）。"""
        ns = instance_namespace(plugin_namespace)
        stmt = (
            select(EvalDatasetItem)
            .where(EvalDatasetItem.dataset_id == dataset_id, EvalDatasetItem.plugin_namespace == ns)
            .order_by(EvalDatasetItem.item_index.asc())
        )
        return list((await db.execute(stmt)).scalars().all())

    async def mark_built(
        self,
        db: AsyncSession,
        dataset_id: str,
        *,
        has_gold_chunks: bool,
        has_gold_answers: bool,
        build_metadata: dict,
        plugin_namespace: str | None = None,
    ) -> None:
        """题目写入后回填计数与标注轴（标注轴决定后续能算哪些指标）。"""
        obj = await self.get_dataset(db, dataset_id, plugin_namespace=plugin_namespace)
        if obj is None:
            return
        obj.item_count = int(
            await db.scalar(
                select(func.count()).select_from(EvalDatasetItem).where(EvalDatasetItem.dataset_id == dataset_id)
            )
            or 0
        )
        obj.has_gold_chunks = has_gold_chunks
        obj.has_gold_answers = has_gold_answers
        obj.build_metadata = build_metadata
        await db.flush()

    async def count_by_kb(self, db: AsyncSession, kb_name: str, *, plugin_namespace: str | None = None) -> int:
        return await self.count_scoped(db, plugin_namespace=plugin_namespace, kb_name=kb_name)

    async def delete_by_kb(self, db: AsyncSession, kb_name: str, *, plugin_namespace: str | None = None) -> int:
        """删 KB 下全部数据集（KB 删除时清理，运行记录靠 SET NULL 保留）。"""
        ns = instance_namespace(plugin_namespace)
        result = await db.execute(
            delete(EvalDataset).where(EvalDataset.plugin_namespace == ns, EvalDataset.kb_name == kb_name)
        )
        await db.flush()
        return result_rowcount(result)


eval_dataset_dao = CRUDEvalDataset(EvalDataset)
